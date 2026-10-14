/**
 * TikTok Quality Bypass Engine (Pure JavaScript / WebAssembly Client-Side)
 * ISO Base Media File Format (MP4) Container Optimization & FastStart
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.TikTokBypass = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    const PADDING_SIZE = 8;
    const PADDING_NAL = new Uint8Array([0, 0, 0, 4, 0, 0, 0, 0]); // 8-byte dummy NAL unit
    const KEEP_NALU_TYPES = new Set([1, 5]); // Non-IDR & IDR slice

    function readU16(bytes, offset) {
        return (bytes[offset] << 8) | bytes[offset + 1];
    }

    function readU32(bytes, offset) {
        return ((bytes[offset] << 24) >>> 0) +
               (bytes[offset + 1] << 16) +
               (bytes[offset + 2] << 8) +
               bytes[offset + 3];
    }

    function readU64(bytes, offset) {
        const hi = readU32(bytes, offset);
        const lo = readU32(bytes, offset + 4);
        return hi * 4294967296 + lo;
    }

    function writeU32(bytes, offset, value) {
        bytes[offset] = (value >>> 24) & 0xFF;
        bytes[offset + 1] = (value >>> 16) & 0xFF;
        bytes[offset + 2] = (value >>> 8) & 0xFF;
        bytes[offset + 3] = value & 0xFF;
    }

    function concatBytes(...arrays) {
        let totalLen = 0;
        for (let i = 0; i < arrays.length; i++) {
            totalLen += arrays[i].length;
        }
        const out = new Uint8Array(totalLen);
        let offset = 0;
        for (let i = 0; i < arrays.length; i++) {
            out.set(arrays[i], offset);
            offset += arrays[i].length;
        }
        return out;
    }

    function stringToBytes(str) {
        const out = new Uint8Array(str.length);
        for (let i = 0; i < str.length; i++) {
            out[i] = str.charCodeAt(i) & 0xFF;
        }
        return out;
    }

    function bytesToString(bytes, start, end) {
        let str = '';
        const limit = end !== undefined ? end : bytes.length;
        for (let i = start || 0; i < limit; i++) {
            str += String.fromCharCode(bytes[i]);
        }
        return str;
    }

    function buildBox(typeStr, payloadBytes) {
        const payload = payloadBytes instanceof Uint8Array ? payloadBytes : new Uint8Array(payloadBytes);
        const size = 8 + payload.length;
        const out = new Uint8Array(size);
        writeU32(out, 0, size);
        out[4] = typeStr.charCodeAt(0);
        out[5] = typeStr.charCodeAt(1);
        out[6] = typeStr.charCodeAt(2);
        out[7] = typeStr.charCodeAt(3);
        out.set(payload, 8);
        return out;
    }

    function findBox(data, boxType, start = 0, end = data.length) {
        let pos = start;
        const b0 = boxType.charCodeAt(0);
        const b1 = boxType.charCodeAt(1);
        const b2 = boxType.charCodeAt(2);
        const b3 = boxType.charCodeAt(3);

        while (pos + 8 <= end) {
            let size = readU32(data, pos);
            let headerLen = 8;
            if (size === 1) {
                if (pos + 16 > end) break;
                size = readU64(data, pos + 8);
                headerLen = 16;
            } else if (size === 0) {
                size = end - pos;
            }
            if (size < headerLen || pos + size > end) break;
            if (data[pos + 4] === b0 && data[pos + 5] === b1 && data[pos + 6] === b2 && data[pos + 7] === b3) {
                return { offset: pos, size: size, headerLen: headerLen };
            }
            pos += size;
        }

        // Quét dự phòng (fallback) theo byte signature
        for (let i = start; i + 8 <= end; i++) {
            if (data[i + 4] === b0 && data[i + 5] === b1 && data[i + 6] === b2 && data[i + 7] === b3) {
                let size = readU32(data, i);
                let headerLen = 8;
                if (size === 1 && i + 16 <= end) {
                    size = readU64(data, i + 8);
                    headerLen = 16;
                } else if (size === 0) {
                    size = end - i;
                }
                if (size >= headerLen) {
                    return { offset: i, size: size, headerLen: headerLen };
                }
            }
        }
        return null;
    }

    function findBoxPath(data, path, start = 0, end = data.length) {
        let curStart = start;
        let curEnd = end;
        let found = null;
        for (let i = 0; i < path.length; i++) {
            found = findBox(data, path[i], curStart, curEnd);
            if (!found) return null;
            curStart = found.offset + (found.headerLen || 8);
            curEnd = found.offset + found.size;
        }
        return found;
    }

    function findTrackByHandler(data, moovPos, moovSize, handlerStr) {
        let pos = moovPos + 8;
        const end = moovPos + moovSize;
        while (pos + 8 <= end) {
            let size = readU32(data, pos);
            let headerLen = 8;
            if (size === 1) {
                if (pos + 16 > end) break;
                size = readU64(data, pos + 8);
                headerLen = 16;
            } else if (size === 0) {
                size = end - pos;
            }
            if (size < headerLen || pos + size > end) break;
            if (bytesToString(data, pos + 4, pos + 8) === 'trak') {
                const hdlr = findBoxPath(data, ['mdia', 'hdlr'], pos + headerLen, pos + size);
                if (hdlr) {
                    const htype = bytesToString(data, hdlr.offset + 16, hdlr.offset + 20);
                    if (htype === handlerStr) {
                        return { offset: pos, size: size, headerLen: headerLen };
                    }
                }
            }
            pos += size;
        }
        return null;
    }

    function parseStco(data, offset) {
        const count = readU32(data, offset + 12);
        const out = new Uint32Array(count);
        for (let i = 0; i < count; i++) {
            out[i] = readU32(data, offset + 16 + i * 4);
        }
        return out;
    }

    function parseStsz(data, offset) {
        const uniform = readU32(data, offset + 12);
        const count = readU32(data, offset + 16);
        const out = new Uint32Array(count);
        if (uniform !== 0) {
            out.fill(uniform);
            return out;
        }
        for (let i = 0; i < count; i++) {
            out[i] = readU32(data, offset + 20 + i * 4);
        }
        return out;
    }

    function parseStsc(data, offset) {
        const count = readU32(data, offset + 12);
        const out = [];
        for (let i = 0; i < count; i++) {
            out.push({
                firstChunk: readU32(data, offset + 16 + i * 12),
                samplesPerChunk: readU32(data, offset + 20 + i * 12),
                descIdx: readU32(data, offset + 24 + i * 12)
            });
        }
        return out;
    }

    function parseStts(data, offset) {
        const count = readU32(data, offset + 12);
        const out = [];
        for (let i = 0; i < count; i++) {
            out.push({
                sampleCount: readU32(data, offset + 16 + i * 8),
                sampleDelta: readU32(data, offset + 20 + i * 8)
            });
        }
        return out;
    }

    function parseNalus(sampleBytes) {
        const nalus = [];
        let pos = 0;
        while (pos + 4 <= sampleBytes.length) {
            const naluLen = readU32(sampleBytes, pos);
            if (pos + 4 + naluLen > sampleBytes.length) break;
            const naluType = sampleBytes[pos + 4] & 0x1F;
            nalus.push({
                type: naluType,
                length: naluLen,
                data: sampleBytes.subarray(pos, pos + 4 + naluLen)
            });
            pos += 4 + naluLen;
        }
        return nalus;
    }

    function buildFtyp() {
        const brand = stringToBytes('isom');
        const ver = new Uint8Array(4);
        writeU32(ver, 0, 512);
        const compat = stringToBytes('isomiso2avc1mp41');
        return buildBox('ftyp', concatBytes(brand, ver, compat));
    }

    function buildFree() {
        const out = new Uint8Array(8);
        writeU32(out, 0, 8);
        out[4] = 102; out[5] = 114; out[6] = 101; out[7] = 101; // 'free'
        return out;
    }

    function buildBtrt(bufferSizeDb, maxBitrate, avgBitrate) {
        const payload = new Uint8Array(12);
        writeU32(payload, 0, bufferSizeDb);
        writeU32(payload, 4, maxBitrate);
        writeU32(payload, 8, avgBitrate);
        return buildBox('btrt', payload);
    }

    function buildAvcc(origContent) {
        // Upgrade to High Profile (0x64) and append High profile extensions
        const payload = new Uint8Array(origContent.length + 4);
        payload.set(origContent, 0);
        payload[1] = 0x64; // profile_idc = High Profile (100 = 0x64)
        payload[payload.length - 4] = 0xFD;
        payload[payload.length - 3] = 0xF8;
        payload[payload.length - 2] = 0xF8;
        payload[payload.length - 1] = 0x00;
        return buildBox('avcC', payload);
    }

    function buildStsdVideo(fixedFields, avccBox, colrBox, paspBox, btrtBox) {
        const avc1Content = concatBytes(fixedFields, avccBox, colrBox, paspBox, btrtBox);
        const avc1 = buildBox('avc1', avc1Content);
        const header = new Uint8Array(8);
        writeU32(header, 0, 0); // version & flags
        writeU32(header, 4, 1); // entry count = 1
        return buildBox('stsd', concatBytes(header, avc1));
    }

    function buildStts(entries) {
        const payload = new Uint8Array(8 + entries.length * 8);
        writeU32(payload, 0, 0); // version/flags
        writeU32(payload, 4, entries.length);
        for (let i = 0; i < entries.length; i++) {
            writeU32(payload, 8 + i * 8, entries[i].sampleCount);
            writeU32(payload, 12 + i * 8, entries[i].sampleDelta);
        }
        return buildBox('stts', payload);
    }

    function buildStsc(entries) {
        const payload = new Uint8Array(8 + entries.length * 12);
        writeU32(payload, 0, 0);
        writeU32(payload, 4, entries.length);
        for (let i = 0; i < entries.length; i++) {
            writeU32(payload, 8 + i * 12, entries[i].firstChunk);
            writeU32(payload, 12 + i * 12, entries[i].samplesPerChunk);
            writeU32(payload, 16 + i * 12, entries[i].descIdx);
        }
        return buildBox('stsc', payload);
    }

    function buildStsz(sampleSizes) {
        const count = sampleSizes.length;
        const payload = new Uint8Array(12 + count * 4);
        writeU32(payload, 0, 0); // version/flags
        writeU32(payload, 4, 0); // uniform size = 0
        writeU32(payload, 8, count);
        for (let i = 0; i < count; i++) {
            writeU32(payload, 12 + i * 4, sampleSizes[i]);
        }
        return buildBox('stsz', payload);
    }

    function buildStco(offsets) {
        const count = offsets.length;
        const payload = new Uint8Array(8 + count * 4);
        writeU32(payload, 0, 0);
        writeU32(payload, 4, count);
        for (let i = 0; i < count; i++) {
            writeU32(payload, 8 + i * 4, offsets[i]);
        }
        return buildBox('stco', payload);
    }

    function buildMvhdV1(timescale = 1000, nextTrackId = 4) {
        const payload = new Uint8Array(112);
        payload[0] = 1; // Version 1 (64-bit)
        writeU32(payload, 20, timescale);
        // 64-bit Duration: 0xFFFFFFFFFFFFFFFF
        for (let i = 24; i < 32; i++) {
            payload[i] = 0xFF;
        }
        writeU32(payload, 32, 0x00010000); // rate 1.0
        payload[36] = 0x01; payload[37] = 0x00; // volume 1.0
        writeU32(payload, 48, 0x00010000); // matrix
        writeU32(payload, 64, 0x00010000);
        writeU32(payload, 80, 0x40000000);
        writeU32(payload, 108, nextTrackId);
        return buildBox('mvhd', payload);
    }

    function buildHdlr(handlerTypeStr, nameStr) {
        const htype = stringToBytes(handlerTypeStr);
        const nameBytes = stringToBytes(nameStr);
        const payload = new Uint8Array(8 + 4 + 12 + nameBytes.length + 1);
        payload.set(htype, 8);
        payload.set(nameBytes, 24);
        return buildBox('hdlr', payload);
    }

    function buildMdhd(origContent, newDuration, language) {
        const payload = new Uint8Array(origContent);
        if (newDuration !== undefined) {
            writeU32(payload, 16, newDuration);
        }
        if (language !== undefined) {
            payload[20] = (language >> 8) & 0xFF;
            payload[21] = language & 0xFF;
        }
        return buildBox('mdhd', payload);
    }

    function buildTkhd(origBoxBytes, newDurationMs) {
        const out = new Uint8Array(origBoxBytes);
        if (newDurationMs !== undefined) {
            writeU32(out, 28, newDurationMs);
        }
        return out;
    }

    /**
     * Main transformation function
     * @param {Uint8Array} data
     * @param {Object} options
     * @param {Function} onProgress
     * @returns {Uint8Array} transformed MP4
     */
    function transformMp4(data, options = {}, onProgress = null) {
        const multiplier = options.multiplier || 10;
        const log = (msg, pct) => {
            if (onProgress) onProgress(msg, pct);
        };

        log("Đang phân tích cấu trúc Atom MP4...", 10);

        const moovBox = findBox(data, 'moov');
        const mdatBox = findBox(data, 'mdat');
        if (!moovBox || !mdatBox) {
            throw new Error("Không thể phân tích cấu trúc video (không tìm thấy moov/mdat). Bạn hãy chọn chế độ 'Nén giảm dung lượng' để hệ thống tự động chuẩn hóa video này.");
        }

        const mdatDataStart = mdatBox.offset + (mdatBox.headerLen || 8);

        // Video track
        const vt = findTrackByHandler(data, moovBox.offset, moovBox.size, 'vide');
        if (!vt) throw new Error("Không tìm thấy luồng Video trong tệp!");

        const vtStart = vt.offset + 8;
        const vtEnd = vt.offset + vt.size;
        const stbl = findBoxPath(data, ['mdia', 'minf', 'stbl'], vtStart, vtEnd);
        if (!stbl) throw new Error("Không tìm thấy bảng stbl trong luồng Video!");

        const sbStart = stbl.offset + 8;
        const sbEnd = stbl.offset + stbl.size;

        const stco = findBox(data, 'stco', sbStart, sbEnd);
        const stsz = findBox(data, 'stsz', sbStart, sbEnd);
        const stsc = findBox(data, 'stsc', sbStart, sbEnd);
        const stts = findBox(data, 'stts', sbStart, sbEnd);
        const stsd = findBox(data, 'stsd', sbStart, sbEnd);
        const stss = findBox(data, 'stss', sbStart, sbEnd);
        const sdtp = findBox(data, 'sdtp', sbStart, sbEnd);
        const ctts = findBox(data, 'ctts', sbStart, sbEnd);

        if (!stco || !stsz || !stsc || !stts || !stsd) {
            throw new Error("Thiếu các bảng metadata video thiết yếu (stco/stsz/stsc/stts/stsd).");
        }

        const videoChunks = parseStco(data, stco.offset);
        const videoSizes = parseStsz(data, stsz.offset);
        const videoStsc = parseStsc(data, stsc.offset);
        const videoStts = parseStts(data, stts.offset);

        const origFrames = videoSizes.length;
        const timeDelta = videoStts[0].sampleDelta;
        const padCount = origFrames * (multiplier - 1);
        const totalFrames = origFrames + padCount;

        const vMdhd = findBoxPath(data, ['mdia', 'mdhd'], vtStart, vtEnd);
        const vTimescale = readU32(data, vMdhd.offset + 20);
        const vDuration = readU32(data, vMdhd.offset + 24);
        const vDurationSec = vDuration / vTimescale;

        log(`Tìm thấy ${origFrames} frames (${(vTimescale / timeDelta).toFixed(0)} fps, ${vDurationSec.toFixed(1)}s)`, 25);

        // Strip SEI from first sample
        log("Tối ưu hóa NALU header & gỡ bỏ SEI metadata thừa...", 35);
        const firstOff = videoChunks[0];
        const firstSize = videoSizes[0];
        const firstSample = data.subarray(firstOff, firstOff + firstSize);

        const nalus = parseNalus(firstSample);
        const kept = [];
        for (let i = 0; i < nalus.length; i++) {
            if (KEEP_NALU_TYPES.has(nalus[i].type)) {
                kept.push(nalus[i].data);
            }
        }
        const newFirst = kept.length > 0 ? concatBytes(...kept) : firstSample;
        const newFirstSize = newFirst.length;
        const seiRemoved = firstSize - newFirstSize;

        // Audio track
        log("Căn chỉnh luồng âm thanh Audio Track...", 45);
        const at = findTrackByHandler(data, moovBox.offset, moovBox.size, 'soun');
        const hasAudio = at !== null;
        let audioChunks = null, audioSizes = null, audioStts = null;
        let aTimescale = 0, newAudioDur = 0, newAudioDurMs = 0;
        let newAStts = null;
        let aStsdBox = null, aStscBox = null, aStszBox = null;
        let aSgpdBox = new Uint8Array(0), aSbgpBox = new Uint8Array(0);
        let audioSmhd = null, audioDinf = null, audioTkhd = null, audioEdts = new Uint8Array(0);
        let aMdhd = null;

        if (hasAudio) {
            const atStart = at.offset + 8;
            const atEnd = at.offset + at.size;
            const aStbl = findBoxPath(data, ['mdia', 'minf', 'stbl'], atStart, atEnd);
            const aSbStart = aStbl.offset + 8;
            const aSbEnd = aStbl.offset + aStbl.size;

            const aStco = findBox(data, 'stco', aSbStart, aSbEnd);
            const aStsz = findBox(data, 'stsz', aSbStart, aSbEnd);
            const aStsc = findBox(data, 'stsc', aSbStart, aSbEnd);
            const aStts = findBox(data, 'stts', aSbStart, aSbEnd);
            const aStsd = findBox(data, 'stsd', aSbStart, aSbEnd);
            const aSgpd = findBox(data, 'sgpd', aSbStart, aSbEnd);
            const aSbgp = findBox(data, 'sbgp', aSbStart, aSbEnd);

            audioChunks = parseStco(data, aStco.offset);
            audioSizes = parseStsz(data, aStsz.offset);
            audioStts = parseStts(data, aStts.offset);

            aMdhd = findBoxPath(data, ['mdia', 'mdhd'], atStart, atEnd);
            aTimescale = readU32(data, aMdhd.offset + 20);

            const aElst = findBoxPath(data, ['edts', 'elst'], atStart, atEnd);
            const aElstSegDur = aElst ? readU32(data, aElst.offset + 16) : 0;
            const aElstMediaTime = aElst ? readU32(data, aElst.offset + 20) : 0;

            newAudioDurMs = aElstSegDur || Math.round(vDurationSec * 1000);
            newAudioDur = Math.floor(newAudioDurMs * aTimescale / 1000);

            const aDelta = audioStts[0].sampleDelta;
            const aCount = audioSizes.length;
            const targetStts = newAudioDur + aElstMediaTime;
            const mainN = aCount - 1;
            const lastDelta = targetStts - mainN * aDelta;

            if (lastDelta > 0 && lastDelta <= aDelta) {
                newAStts = [
                    { sampleCount: mainN, sampleDelta: aDelta },
                    { sampleCount: 1, sampleDelta: lastDelta }
                ];
            } else {
                newAStts = audioStts;
                newAudioDur = readU32(data, aMdhd.offset + 24);
                newAudioDurMs = Math.floor(newAudioDur * 1000 / aTimescale);
            }

            // Audio track boxes
            const aTkhd = findBox(data, 'tkhd', atStart, atEnd);
            audioTkhd = buildTkhd(data.subarray(aTkhd.offset, aTkhd.offset + aTkhd.size), newAudioDurMs);

            const aEdts = findBox(data, 'edts', atStart, atEnd);
            if (aEdts) audioEdts = data.subarray(aEdts.offset, aEdts.offset + aEdts.size);

            const aSmhd = findBoxPath(data, ['mdia', 'minf', 'smhd'], atStart, atEnd);
            audioSmhd = data.subarray(aSmhd.offset, aSmhd.offset + aSmhd.size);

            const aDinf = findBoxPath(data, ['mdia', 'minf', 'dinf'], atStart, atEnd);
            audioDinf = data.subarray(aDinf.offset, aDinf.offset + aDinf.size);

            aStsdBox = data.subarray(aStsd.offset, aStsd.offset + aStsd.size);
            aStscBox = data.subarray(aStsc.offset, aStsc.offset + aStsc.size);
            aStszBox = data.subarray(aStsz.offset, aStsz.offset + aStsz.size);
            if (aSgpd) aSgpdBox = data.subarray(aSgpd.offset, aSgpd.offset + aSgpd.size);
            if (aSbgp) aSbgpBox = data.subarray(aSbgp.offset, aSbgp.offset + aSbgp.size);
        }

        // Build new mdat
        log("Bơm Ghost Frames NALU x" + multiplier + " vào luồng mdat...", 60);
        const mdatBefore = data.subarray(mdatDataStart, firstOff);
        const mdatAfter = data.subarray(firstOff + firstSize, mdatBox.offset + mdatBox.size);
        const newMdatContent = concatBytes(mdatBefore, newFirst, mdatAfter, PADDING_NAL);
        const newMdat = buildBox('mdat', newMdatContent);

        // Build new moov
        log("Nâng cấp avcC High Profile (0x64) & mvhd 64-bit max duration...", 75);
        const ftyp = buildFtyp();
        const free = buildFree();
        const mvhd = buildMvhdV1(1000, 4);

        // Video Track boxes
        const vTkhdBox = data.subarray(vtStart, vtStart + readU32(data, vtStart));
        const edtsBox = findBox(data, 'edts', vtStart, vtEnd);
        const videoEdts = edtsBox ? data.subarray(edtsBox.offset, edtsBox.offset + edtsBox.size) : new Uint8Array(0);
        const videoMdhd = data.subarray(vMdhd.offset, vMdhd.offset + vMdhd.size);

        const vHdlr = findBoxPath(data, ['mdia', 'hdlr'], vtStart, vtEnd);
        const videoHdlr = data.subarray(vHdlr.offset, vHdlr.offset + vHdlr.size);

        const vmhd = findBoxPath(data, ['mdia', 'minf', 'vmhd'], vtStart, vtEnd);
        const videoVmhd = data.subarray(vmhd.offset, vmhd.offset + vmhd.size);

        const dinf = findBoxPath(data, ['mdia', 'minf', 'dinf'], vtStart, vtEnd);
        const videoDinf = data.subarray(dinf.offset, dinf.offset + dinf.size);

        // Video STSD
        const stsdContent = data.subarray(stsd.offset + 8, stsd.offset + stsd.size);
        const avc1Fixed = stsdContent.subarray(16, 94);

        let avccRel = -1;
        for (let i = 0; i < stsdContent.length - 4; i++) {
            if (stsdContent[i] === 97 && stsdContent[i+1] === 118 && stsdContent[i+2] === 99 && stsdContent[i+3] === 67) {
                avccRel = i;
                break;
            }
        }
        if (avccRel === -1) {
            throw new Error("Video này không phải chuẩn H.264 (có thể do quay bằng chế độ HEVC/H.265 của điện thoại). Vui lòng chọn chế độ 'Nén giảm dung lượng' để hệ thống tự động chuyển sang chuẩn TikTok!");
        }

        const avccStart = avccRel - 4;
        const avccOrigSize = readU32(stsdContent, avccStart);
        const avccNew = buildAvcc(stsdContent.subarray(avccStart + 8, avccStart + avccOrigSize));

        let colrBox = new Uint8Array(0);
        for (let i = 0; i < stsdContent.length - 4; i++) {
            if (stsdContent[i] === 99 && stsdContent[i+1] === 111 && stsdContent[i+2] === 108 && stsdContent[i+3] === 114) {
                const cs = i - 4;
                colrBox = stsdContent.subarray(cs, cs + readU32(stsdContent, cs));
                break;
            }
        }

        let paspBox = new Uint8Array(0);
        for (let i = 0; i < stsdContent.length - 4; i++) {
            if (stsdContent[i] === 112 && stsdContent[i+1] === 97 && stsdContent[i+2] === 115 && stsdContent[i+3] === 112) {
                const ps = i - 4;
                paspBox = stsdContent.subarray(ps, ps + readU32(stsdContent, ps));
                break;
            }
        }

        let totalVBytes = 0;
        for (let i = 0; i < videoSizes.length; i++) totalVBytes += videoSizes[i];
        totalVBytes = totalVBytes - firstSize + newFirstSize;
        const newVAvgBr = Math.floor(totalVBytes * 8 / vDurationSec);

        let maxBr = newVAvgBr;
        for (let i = 0; i < stsdContent.length - 4; i++) {
            if (stsdContent[i] === 98 && stsdContent[i+1] === 116 && stsdContent[i+2] === 114 && stsdContent[i+3] === 116) {
                maxBr = readU32(stsdContent, i + 8) || newVAvgBr;
                break;
            }
        }

        const btrtNew = buildBtrt(0, maxBr, newVAvgBr);
        const videoStsdNew = buildStsdVideo(avc1Fixed, avccNew, colrBox, paspBox, btrtNew);

        // Video Tables
        const videoSttsNew = buildStts([
            { sampleCount: origFrames, sampleDelta: timeDelta },
            { sampleCount: padCount, sampleDelta: timeDelta }
        ]);

        const videoStss = stss ? data.subarray(stss.offset, stss.offset + stss.size) : new Uint8Array(0);
        const videoSdtp = sdtp ? data.subarray(sdtp.offset, sdtp.offset + sdtp.size) : new Uint8Array(0);
        const videoCtts = ctts ? data.subarray(ctts.offset, ctts.offset + ctts.size) : new Uint8Array(0);

        const newStscEntries = [];
        for (let i = 0; i < videoStsc.length; i++) {
            newStscEntries.push(videoStsc[i]);
        }
        newStscEntries.push({
            firstChunk: videoChunks.length + 1,
            samplesPerChunk: 1,
            descIdx: 1
        });
        const videoStscNew = buildStsc(newStscEntries);

        const newSampleSizes = new Uint32Array(totalFrames);
        newSampleSizes[0] = newFirstSize;
        for (let i = 1; i < videoSizes.length; i++) {
            newSampleSizes[i] = videoSizes[i];
        }
        for (let i = videoSizes.length; i < totalFrames; i++) {
            newSampleSizes[i] = PADDING_SIZE;
        }
        const videoStszNew = buildStsz(newSampleSizes);

        // STCO placeholder for sizing
        const totalVChunks = videoChunks.length + padCount;
        const stcoPhSize = 16 + totalVChunks * 4;
        const vStcoPh = new Uint8Array(stcoPhSize);
        writeU32(vStcoPh, 0, stcoPhSize);
        vStcoPh[4] = 115; vStcoPh[5] = 116; vStcoPh[6] = 99; vStcoPh[7] = 111; // 'stco'

        const vStblParts = [videoStsdNew, videoSttsNew];
        if (videoStss.length > 0) vStblParts.push(videoStss);
        if (videoSdtp.length > 0) vStblParts.push(videoSdtp);
        if (videoCtts.length > 0) vStblParts.push(videoCtts);
        vStblParts.push(videoStscNew, videoStszNew, vStcoPh);

        let videoStbl = buildBox('stbl', concatBytes(...vStblParts));
        let videoMinf = buildBox('minf', concatBytes(videoVmhd, videoDinf, videoStbl));
        let videoMdia = buildBox('mdia', concatBytes(videoMdhd, videoHdlr, videoMinf));
        let videoTrak = buildBox('trak', concatBytes(vTkhdBox, videoEdts, videoMdia));

        // Audio Track
        let audioTrak = new Uint8Array(0);
        let aStcoPh = new Uint8Array(0);
        if (hasAudio) {
            const aSttsNew = buildStts(newAStts);
            const aMdhdBox = buildMdhd(data.subarray(aMdhd.offset + 8, aMdhd.offset + aMdhd.size), newAudioDur, 0x55C4);
            const aHdlrBox = buildHdlr('soun', 'SoundHandler');

            const aStcoPhSize = 16 + audioChunks.length * 4;
            aStcoPh = new Uint8Array(aStcoPhSize);
            writeU32(aStcoPh, 0, aStcoPhSize);
            aStcoPh[4] = 115; aStcoPh[5] = 116; aStcoPh[6] = 99; aStcoPh[7] = 111;

            const aStblParts = [aStsdBox, aSttsNew, aStscBox, aStszBox, aStcoPh];
            if (aSgpdBox.length > 0) aStblParts.push(aSgpdBox);
            if (aSbgpBox.length > 0) aStblParts.push(aSbgpBox);

            const audioStbl = buildBox('stbl', concatBytes(...aStblParts));
            const audioMinf = buildBox('minf', concatBytes(audioSmhd, audioDinf, audioStbl));
            const audioMdia = buildBox('mdia', concatBytes(aMdhdBox, aHdlrBox, audioMinf));
            audioTrak = buildBox('trak', concatBytes(audioTkhd, audioEdts, audioMdia));
        }

        // FastStart moov calculation
        log("Tính toán FastStart: Đưa moov lên đầu & tính bù stco chunk offsets...", 85);
        let moov = buildBox('moov', concatBytes(mvhd, videoTrak, audioTrak));
        const moovSizeFinal = moov.length;

        const newMdatStart = ftyp.length + free.length + moovSizeFinal + 8;
        const firstVideoRel = firstOff - mdatDataStart;
        const padAbs = newMdatStart + newMdatContent.length - PADDING_SIZE;

        const newVOffsets = new Uint32Array(totalVChunks);
        for (let i = 0; i < videoChunks.length; i++) {
            const rel = videoChunks[i] - mdatDataStart;
            newVOffsets[i] = (rel <= firstVideoRel)
                ? (newMdatStart + rel)
                : (newMdatStart + rel - seiRemoved);
        }
        for (let i = videoChunks.length; i < totalVChunks; i++) {
            newVOffsets[i] = padAbs;
        }

        // Rebuild with real STCO offsets
        vStblParts[vStblParts.length - 1] = buildStco(newVOffsets);
        videoStbl = buildBox('stbl', concatBytes(...vStblParts));
        videoMinf = buildBox('minf', concatBytes(videoVmhd, videoDinf, videoStbl));
        videoMdia = buildBox('mdia', concatBytes(videoMdhd, videoHdlr, videoMinf));
        videoTrak = buildBox('trak', concatBytes(vTkhdBox, videoEdts, videoMdia));

        if (hasAudio) {
            const newAOffsets = new Uint32Array(audioChunks.length);
            for (let i = 0; i < audioChunks.length; i++) {
                const rel = audioChunks[i] - mdatDataStart;
                newAOffsets[i] = (rel < firstVideoRel)
                    ? (newMdatStart + rel)
                    : (newMdatStart + rel - seiRemoved);
            }
            const aSttsNew = buildStts(newAStts);
            const aMdhdBox = buildMdhd(data.subarray(aMdhd.offset + 8, aMdhd.offset + aMdhd.size), newAudioDur, 0x55C4);
            const aHdlrBox = buildHdlr('soun', 'SoundHandler');

            const aStblParts = [aStsdBox, aSttsNew, aStscBox, aStszBox, buildStco(newAOffsets)];
            if (aSgpdBox.length > 0) aStblParts.push(aSgpdBox);
            if (aSbgpBox.length > 0) aStblParts.push(aSbgpBox);

            const audioStbl = buildBox('stbl', concatBytes(...aStblParts));
            const audioMinf = buildBox('minf', concatBytes(audioSmhd, audioDinf, audioStbl));
            const audioMdia = buildBox('mdia', concatBytes(aMdhdBox, aHdlrBox, audioMinf));
            audioTrak = buildBox('trak', concatBytes(audioTkhd, audioEdts, audioMdia));
        }

        moov = buildBox('moov', concatBytes(mvhd, videoTrak, audioTrak));
        if (moov.length !== moovSizeFinal) {
            console.warn(`moov size shifted: was ${moovSizeFinal}, now ${moov.length}`);
        }

        log("Hoàn tất tối ưu hóa container MP4!", 100);
        return concatBytes(ftyp, free, moov, newMdat);
    }

    return {
        transformMp4: transformMp4
    };
}));
