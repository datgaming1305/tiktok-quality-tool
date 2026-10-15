/**
 * TikTok Quality Bypass Engine (Pure JavaScript Client-Side)
 * ISO Base Media File Format (MP4) Container Optimization & FastStart
 * Implements 100% Haze Quality Method (Clean Video Track + Track 3 Audio Padding x10)
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

    const PADDING_NAL = new Uint8Array([0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0x00]); // 8-byte dummy
    const SILENT_AAC = new Uint8Array([0x21, 0x10, 0x04, 0x60, 0x8c, 0x1c]); // 6-byte silent AAC frame
    const UDTA_HAZE = new Uint8Array([
        0, 0, 0, 127, 117, 100, 116, 97, 0, 0, 0, 119, 109, 101, 116, 97,
        0, 0, 0, 0, 0, 0, 0, 33, 104, 100, 108, 114, 0, 0, 0, 0,
        0, 0, 0, 0, 109, 100, 105, 114, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 74, 105, 108, 115, 116, 0, 0, 0,
        66, 169, 116, 111, 111, 0, 0, 0, 58, 100, 97, 116, 97, 0, 0, 0,
        1, 0, 0, 0, 0, 72, 97, 122, 101, 32, 81, 117, 97, 108, 105, 116,
        121, 32, 77, 101, 116, 104, 111, 100, 32, 104, 116, 116, 112, 115, 58, 47,
        47, 104, 97, 122, 101, 109, 101, 116, 104, 111, 100, 46, 120, 121, 122
    ]);

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

    function writeU64(bytes, offset, value) {
        const hi = Math.floor(value / 4294967296);
        const lo = value % 4294967296;
        writeU32(bytes, offset, hi);
        writeU32(bytes, offset + 4, lo);
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

        // Quét signature fallback
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

    function parseChunkOffsets(data, box) {
        const is64 = (bytesToString(data, box.offset + 4, box.offset + 8) === 'co64');
        const count = readU32(data, box.offset + 12);
        const out = new Float64Array(count);
        if (is64) {
            for (let i = 0; i < count; i++) {
                out[i] = readU64(data, box.offset + 16 + i * 8);
            }
        } else {
            for (let i = 0; i < count; i++) {
                out[i] = readU32(data, box.offset + 16 + i * 4);
            }
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
        const payload = new Uint8Array(origContent);
        payload[1] = 0x64; // High Profile (100 = 0x64)
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
        writeU32(payload, 0, 0);
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
        writeU32(payload, 0, 0);
        writeU32(payload, 4, 0);
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

    function updateTkhd(origBoxBytes, newTrackId, newDurationMs, newAltGroup) {
        const out = new Uint8Array(origBoxBytes);
        const ver = out[8];
        if (ver === 0) {
            if (newTrackId !== undefined) writeU32(out, 20, newTrackId);
            if (newDurationMs !== undefined) writeU32(out, 28, newDurationMs);
            if (newAltGroup !== undefined) {
                out[42] = (newAltGroup >> 8) & 0xFF;
                out[43] = newAltGroup & 0xFF;
            }
        } else {
            if (newTrackId !== undefined) writeU32(out, 28, newTrackId);
            if (newDurationMs !== undefined) {
                writeU32(out, 36, 0);
                writeU32(out, 40, newDurationMs);
            }
            if (newAltGroup !== undefined) {
                out[54] = (newAltGroup >> 8) & 0xFF;
                out[55] = newAltGroup & 0xFF;
            }
        }
        return out;
    }

    function buildElst(durationMs) {
        const elstPayload = new Uint8Array(20);
        writeU32(elstPayload, 0, 0); // version/flags
        writeU32(elstPayload, 4, 1); // entry count = 1
        writeU32(elstPayload, 8, durationMs); // segment duration
        writeU32(elstPayload, 12, 0); // media time
        writeU32(elstPayload, 16, 0x00010000); // media rate 1.0
        const elstBox = buildBox('elst', elstPayload);
        return buildBox('edts', elstBox);
    }

    /**
     * Main transformation function
     * Transforms MP4 to 100% exact Haze Quality Method structure
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
            throw new Error("Không thể phân tích cấu trúc video (không tìm thấy moov/mdat). Bạn hãy chọn chế độ 'Nén giảm dung lượng' để chuẩn hóa video này.");
        }

        const origMdatDataStart = mdatBox.offset + (mdatBox.headerLen || 8);
        const origMdatPayloadLen = mdatBox.size - (mdatBox.headerLen || 8);

        // 1. VIDEO TRACK (TRACK 1 - 100% Frame gốc nguyên bản)
        log("Tối ưu hóa Video Track (bảo toàn 100% frame gốc, 60fps mượt mà)...", 20);
        const vt = findTrackByHandler(data, moovBox.offset, moovBox.size, 'vide');
        if (!vt) throw new Error("Không tìm thấy luồng Video trong tệp!");

        const vtStart = vt.offset + 8;
        const vtEnd = vt.offset + vt.size;
        const vStbl = findBoxPath(data, ['mdia', 'minf', 'stbl'], vtStart, vtEnd);
        if (!vStbl) throw new Error("Không tìm thấy bảng stbl trong luồng Video!");

        const vsbStart = vStbl.offset + 8;
        const vsbEnd = vStbl.offset + vStbl.size;

        const vStco = findBox(data, 'stco', vsbStart, vsbEnd) || findBox(data, 'co64', vsbStart, vsbEnd);
        const vStsz = findBox(data, 'stsz', vsbStart, vsbEnd);
        const vStsc = findBox(data, 'stsc', vsbStart, vsbEnd);
        const vStts = findBox(data, 'stts', vsbStart, vsbEnd);
        const vStsd = findBox(data, 'stsd', vsbStart, vsbEnd);
        const vStss = findBox(data, 'stss', vsbStart, vsbEnd);
        const vSdtp = findBox(data, 'sdtp', vsbStart, vsbEnd);
        const vCtts = findBox(data, 'ctts', vsbStart, vsbEnd);

        if (!vStco || !vStsz || !vStsc || !vStts || !vStsd) {
            throw new Error("Thiếu các bảng metadata video thiết yếu.");
        }

        const videoChunks = parseChunkOffsets(data, vStco);
        const videoSizes = parseStsz(data, vStsz.offset);
        const origFrames = videoSizes.length;

        const vMdhd = findBoxPath(data, ['mdia', 'mdhd'], vtStart, vtEnd);
        const vTimescale = readU32(data, vMdhd.offset + 20);
        const vDuration = readU32(data, vMdhd.offset + 24);
        const vDurationSec = vDuration / vTimescale;
        const vDurationMs = Math.round(vDurationSec * 1000);

        log(`Tìm thấy ${origFrames} frames (${(origFrames / vDurationSec).toFixed(0)} fps, ${vDurationSec.toFixed(1)}s)`, 30);

        // Nâng cấp AVC High Profile (0x64) + btrt
        const stsdContent = data.subarray(vStsd.offset + 8, vStsd.offset + vStsd.size);
        const avc1Fixed = stsdContent.subarray(16, 94);

        let avccRel = -1;
        for (let i = 0; i < stsdContent.length - 4; i++) {
            if (stsdContent[i] === 97 && stsdContent[i+1] === 118 && stsdContent[i+2] === 99 && stsdContent[i+3] === 67) {
                avccRel = i;
                break;
            }
        }
        if (avccRel === -1) {
            throw new Error("Video này không phải chuẩn H.264 (avcC). Vui lòng chọn chế độ 'Nén giảm dung lượng' để hệ thống tự động chuyển sang chuẩn TikTok!");
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

        // Video Tkhd: track_id = 1, alternate_group = 0
        const vTkhdBoxOrig = data.subarray(vtStart, vtStart + readU32(data, vtStart));
        const vTkhdNew = updateTkhd(vTkhdBoxOrig, 1, vDurationMs, 0);

        const vEdtsBox = findBox(data, 'edts', vtStart, vtEnd);
        const videoEdts = vEdtsBox ? data.subarray(vEdtsBox.offset, vEdtsBox.offset + vEdtsBox.size) : new Uint8Array(0);
        const videoMdhd = data.subarray(vMdhd.offset, vMdhd.offset + vMdhd.size);

        const vHdlr = findBoxPath(data, ['mdia', 'hdlr'], vtStart, vtEnd);
        const videoHdlr = data.subarray(vHdlr.offset, vHdlr.offset + vHdlr.size);

        const vmhd = findBoxPath(data, ['mdia', 'minf', 'vmhd'], vtStart, vtEnd);
        const videoVmhd = data.subarray(vmhd.offset, vmhd.offset + vmhd.size);

        const dinf = findBoxPath(data, ['mdia', 'minf', 'dinf'], vtStart, vtEnd);
        const videoDinf = data.subarray(dinf.offset, dinf.offset + dinf.size);

        // Giữ nguyên 100% bảng stts, stsc, stsz, stss, ctts, sdtp gốc!
        const videoSttsBox = data.subarray(vStts.offset, vStts.offset + vStts.size);
        const videoStscBox = data.subarray(vStsc.offset, vStsc.offset + vStsc.size);
        const videoStszBox = data.subarray(vStsz.offset, vStsz.offset + vStsz.size);
        const videoStssBox = vStss ? data.subarray(vStss.offset, vStss.offset + vStss.size) : new Uint8Array(0);
        const videoSdtpBox = vSdtp ? data.subarray(vSdtp.offset, vSdtp.offset + vSdtp.size) : new Uint8Array(0);
        const videoCttsBox = vCtts ? data.subarray(vCtts.offset, vCtts.offset + vCtts.size) : new Uint8Array(0);

        // Video STCO placeholder
        const vStcoPhSize = 16 + videoChunks.length * 4;
        const vStcoPh = new Uint8Array(vStcoPhSize);
        writeU32(vStcoPh, 0, vStcoPhSize);
        vStcoPh[4] = 115; vStcoPh[5] = 116; vStcoPh[6] = 99; vStcoPh[7] = 111;

        const vStblParts = [videoStsdNew, videoSttsBox];
        if (videoStssBox.length > 0) vStblParts.push(videoStssBox);
        if (videoSdtpBox.length > 0) vStblParts.push(videoSdtpBox);
        if (videoCttsBox.length > 0) vStblParts.push(videoCttsBox);
        vStblParts.push(videoStscBox, videoStszBox, vStcoPh);

        let videoStbl = buildBox('stbl', concatBytes(...vStblParts));
        let videoMinf = buildBox('minf', concatBytes(videoVmhd, videoDinf, videoStbl));
        let videoMdia = buildBox('mdia', concatBytes(videoMdhd, videoHdlr, videoMinf));
        let videoTrak = buildBox('trak', concatBytes(vTkhdNew, videoEdts, videoMdia));

        // 2. AUDIO TRACK (TRACK 2 - Genuine Audio)
        log("Chuẩn hóa luồng Audio Track gốc (Track 2, group 1)...", 45);
        const at = findTrackByHandler(data, moovBox.offset, moovBox.size, 'soun');
        if (!at) {
            throw new Error("Video không có luồng âm thanh. Chuẩn Haze Method yêu cầu video có ít nhất 1 luồng Audio!");
        }

        const atStart = at.offset + 8;
        const atEnd = at.offset + at.size;
        const aStbl = findBoxPath(data, ['mdia', 'minf', 'stbl'], atStart, atEnd);
        const asbStart = aStbl.offset + 8;
        const asbEnd = aStbl.offset + aStbl.size;

        const aStco = findBox(data, 'stco', asbStart, asbEnd) || findBox(data, 'co64', asbStart, asbEnd);
        const aStsz = findBox(data, 'stsz', asbStart, asbEnd);
        const aStsc = findBox(data, 'stsc', asbStart, asbEnd);
        const aStts = findBox(data, 'stts', asbStart, asbEnd);
        const aStsd = findBox(data, 'stsd', asbStart, asbEnd);
        const aSgpd = findBox(data, 'sgpd', asbStart, asbEnd);
        const aSbgp = findBox(data, 'sbgp', asbStart, asbEnd);

        const audioChunks = parseChunkOffsets(data, aStco);
        const audioSizes = parseStsz(data, aStsz.offset);
        const audioStts = parseStts(data, aStts.offset);

        const aMdhd = findBoxPath(data, ['mdia', 'mdhd'], atStart, atEnd);
        const aTimescale = readU32(data, aMdhd.offset + 20);
        const aDuration = readU32(data, aMdhd.offset + 24);
        const aDurationMs = Math.round(aDuration * 1000 / aTimescale);

        const aTkhdOrig = data.subarray(atStart, atStart + readU32(data, atStart));
        const aTkhdNew = updateTkhd(aTkhdOrig, 2, aDurationMs, 1); // track_id = 2, alt_group = 1

        const aEdtsBox = findBox(data, 'edts', atStart, atEnd);
        const audioEdts = aEdtsBox ? data.subarray(aEdtsBox.offset, aEdtsBox.offset + aEdtsBox.size) : new Uint8Array(0);
        const audioMdhd = data.subarray(aMdhd.offset, aMdhd.offset + aMdhd.size);

        const aHdlr = findBoxPath(data, ['mdia', 'hdlr'], atStart, atEnd);
        const audioHdlr = data.subarray(aHdlr.offset, aHdlr.offset + aHdlr.size);

        const aSmhd = findBoxPath(data, ['mdia', 'minf', 'smhd'], atStart, atEnd);
        const audioSmhd = data.subarray(aSmhd.offset, aSmhd.offset + aSmhd.size);

        const aDinf = findBoxPath(data, ['mdia', 'minf', 'dinf'], atStart, atEnd);
        const audioDinf = data.subarray(aDinf.offset, aDinf.offset + aDinf.size);

        const aStsdBox = data.subarray(aStsd.offset, aStsd.offset + aStsd.size);
        const aSttsBox = data.subarray(aStts.offset, aStts.offset + aStts.size);
        const aStscBox = data.subarray(aStsc.offset, aStsc.offset + aStsc.size);
        const aStszBox = data.subarray(aStsz.offset, aStsz.offset + aStsz.size);
        const aSgpdBox = aSgpd ? data.subarray(aSgpd.offset, aSgpd.offset + aSgpd.size) : new Uint8Array(0);
        const aSbgpBox = aSbgp ? data.subarray(aSbgp.offset, aSbgp.offset + aSbgp.size) : new Uint8Array(0);

        const aStcoPhSize = 16 + audioChunks.length * 4;
        const aStcoPh = new Uint8Array(aStcoPhSize);
        writeU32(aStcoPh, 0, aStcoPhSize);
        aStcoPh[4] = 115; aStcoPh[5] = 116; aStcoPh[6] = 99; aStcoPh[7] = 111;

        const aStblParts = [aStsdBox, aSttsBox, aStscBox, aStszBox, aStcoPh];
        if (aSgpdBox.length > 0) aStblParts.push(aSgpdBox);
        if (aSbgpBox.length > 0) aStblParts.push(aSbgpBox);

        let audioStbl = buildBox('stbl', concatBytes(...aStblParts));
        let audioMinf = buildBox('minf', concatBytes(audioSmhd, audioDinf, audioStbl));
        let audioMdia = buildBox('mdia', concatBytes(audioMdhd, audioHdlr, audioMinf));
        let audioTrak = buildBox('trak', concatBytes(aTkhdNew, audioEdts, audioMdia));

        // 3. TRACK 3: AUDIO DUMMY PADDING TRACK (HAZE QUALITY METHOD x10)
        log(`Tạo Track 3 Audio Padding x${multiplier} (chuẩn Haze Method)...`, 60);
        const A = audioSizes.length;
        const padSamples = A * (multiplier - 1);
        const totalSamples = A + padSamples;
        const aDelta = audioStts[0].sampleDelta || 1024;

        const t3SttsEntries = [
            { sampleCount: A, sampleDelta: aDelta },
            { sampleCount: padSamples, sampleDelta: 1 }
        ];
        const t3SttsBox = buildStts(t3SttsEntries);

        const t3StscEntries = [
            { firstChunk: 1, samplesPerChunk: 1, descIdx: 1 },
            { firstChunk: A, samplesPerChunk: 1 + padSamples, descIdx: 1 }
        ];
        const t3StscBox = buildStsc(t3StscEntries);

        const t3Sizes = new Uint32Array(totalSamples);
        for (let i = 0; i < A; i++) t3Sizes[i] = 6; // 6-byte silent AAC frame
        for (let i = A; i < totalSamples; i++) t3Sizes[i] = 8; // 8-byte dummy unit
        const t3StszBox = buildStsz(t3Sizes);

        const t3Dur = A * aDelta + padSamples * 1;
        const t3DurMs = Math.round(t3Dur * 1000 / aTimescale);

        const t3TkhdBox = updateTkhd(aTkhdOrig, 3, t3DurMs, 2); // track_id = 3, alt_group = 2
        const t3MdhdBox = buildMdhd(data.subarray(aMdhd.offset + 8, aMdhd.offset + aMdhd.size), t3Dur, 0x55C4);
        const t3EdtsBox = buildElst(t3DurMs);
        const t3HdlrBox = buildHdlr('soun', 'SoundHandler');

        const t3StcoPhSize = 16 + A * 4;
        const t3StcoPh = new Uint8Array(t3StcoPhSize);
        writeU32(t3StcoPh, 0, t3StcoPhSize);
        t3StcoPh[4] = 115; t3StcoPh[5] = 116; t3StcoPh[6] = 99; t3StcoPh[7] = 111;

        const t3StblParts = [aStsdBox, t3SttsBox, t3StscBox, t3StszBox, t3StcoPh];
        if (aSgpdBox.length > 0) t3StblParts.push(aSgpdBox);
        if (aSbgpBox.length > 0) t3StblParts.push(aSbgpBox);

        let t3Stbl = buildBox('stbl', concatBytes(...t3StblParts));
        let t3Minf = buildBox('minf', concatBytes(audioSmhd, audioDinf, t3Stbl));
        let t3Mdia = buildBox('mdia', concatBytes(t3MdhdBox, t3HdlrBox, t3Minf));
        let t3Trak = buildBox('trak', concatBytes(t3TkhdBox, t3EdtsBox, t3Mdia));

        // 4. FASTSTART CONTAINER LAYOUT & OFFSET CALCULATION
        log("Tính toán FastStart: Đưa moov lên đầu & tính bù stco chunk offsets...", 75);
        const ftyp = buildFtyp();
        const free = buildFree();
        const mvhd = buildMvhdV1(1000, 4);
        const udta = UDTA_HAZE;

        let moov = buildBox('moov', concatBytes(mvhd, videoTrak, audioTrak, t3Trak, udta));
        const moovSizeFinal = moov.length;

        const track3PayloadLen = A * 6 + padSamples * 8;
        const newMdatPayloadLen = origMdatPayloadLen + track3PayloadLen;

        const is64Mdat = (8 + newMdatPayloadLen > 0xFFFFFFFF);
        const newMdatHeaderLen = is64Mdat ? 16 : 8;

        // Cấu trúc FastStart: ftyp -> moov -> free -> mdat
        const newMdatDataStart = ftyp.length + moovSizeFinal + free.length + newMdatHeaderLen;

        // Video STCO offsets
        const newVOffsets = new Uint32Array(videoChunks.length);
        for (let i = 0; i < videoChunks.length; i++) {
            const rel = videoChunks[i] - origMdatDataStart;
            newVOffsets[i] = newMdatDataStart + rel;
        }

        // Audio STCO offsets (Track 2)
        const newAOffsets = new Uint32Array(audioChunks.length);
        for (let i = 0; i < audioChunks.length; i++) {
            const rel = audioChunks[i] - origMdatDataStart;
            newAOffsets[i] = newMdatDataStart + rel;
        }

        // Track 3 STCO offsets (Track 3)
        const t3StartOffset = newMdatDataStart + origMdatPayloadLen;
        const newT3Offsets = new Uint32Array(A);
        for (let i = 0; i < A; i++) {
            newT3Offsets[i] = t3StartOffset + i * 6;
        }

        // Rebuild Video Trak with real STCO
        vStblParts[vStblParts.length - 1] = buildStco(newVOffsets);
        videoStbl = buildBox('stbl', concatBytes(...vStblParts));
        videoMinf = buildBox('minf', concatBytes(videoVmhd, videoDinf, videoStbl));
        videoMdia = buildBox('mdia', concatBytes(videoMdhd, videoHdlr, videoMinf));
        videoTrak = buildBox('trak', concatBytes(vTkhdNew, videoEdts, videoMdia));

        // Rebuild Audio Trak (Track 2) with real STCO
        aStblParts[4] = buildStco(newAOffsets);
        audioStbl = buildBox('stbl', concatBytes(...aStblParts));
        audioMinf = buildBox('minf', concatBytes(audioSmhd, audioDinf, audioStbl));
        audioMdia = buildBox('mdia', concatBytes(audioMdhd, audioHdlr, audioMinf));
        audioTrak = buildBox('trak', concatBytes(aTkhdNew, audioEdts, audioMdia));

        // Rebuild Track 3 with real STCO
        t3StblParts[4] = buildStco(newT3Offsets);
        t3Stbl = buildBox('stbl', concatBytes(...t3StblParts));
        t3Minf = buildBox('minf', concatBytes(audioSmhd, audioDinf, t3Stbl));
        t3Mdia = buildBox('mdia', concatBytes(t3MdhdBox, t3HdlrBox, t3Minf));
        t3Trak = buildBox('trak', concatBytes(t3TkhdBox, t3EdtsBox, t3Mdia));

        moov = buildBox('moov', concatBytes(mvhd, videoTrak, audioTrak, t3Trak, udta));
        if (moov.length !== moovSizeFinal) {
            throw new Error(`Kích thước moov bị lệch: dự kiến ${moovSizeFinal}, thực tế ${moov.length}`);
        }

        // 5. ASSEMBLE OUTPUT FILE
        log("Ghi tệp MP4 tối ưu hóa hoàn chỉnh...", 85);
        const totalFileSize = ftyp.length + moov.length + free.length + newMdatHeaderLen + newMdatPayloadLen;

        const out = new Uint8Array(totalFileSize);
        let cur = 0;

        out.set(ftyp, cur); cur += ftyp.length;
        out.set(moov, cur); cur += moov.length;
        out.set(free, cur); cur += free.length;

        // Write mdat header
        if (!is64Mdat) {
            writeU32(out, cur, 8 + newMdatPayloadLen);
            out[cur + 4] = 109; out[cur + 5] = 100; out[cur + 6] = 97; out[cur + 7] = 116; // 'mdat'
            cur += 8;
        } else {
            writeU32(out, cur, 1);
            out[cur + 4] = 109; out[cur + 5] = 100; out[cur + 6] = 97; out[cur + 7] = 116;
            writeU64(out, cur + 8, 16 + newMdatPayloadLen);
            cur += 16;
        }

        // Copy original mdat payload
        out.set(data.subarray(origMdatDataStart, origMdatDataStart + origMdatPayloadLen), cur);
        cur += origMdatPayloadLen;

        // Append Track 3 silent frames (A * 6)
        for (let i = 0; i < A; i++) {
            out.set(SILENT_AAC, cur);
            cur += 6;
        }

        // Append Track 3 dummy units (padSamples * 8)
        for (let i = 0; i < padSamples; i++) {
            out.set(PADDING_NAL, cur);
            cur += 8;
        }

        log("Hoàn tất tối ưu hóa container MP4 chuẩn Haze Method!", 100);
        return out;
    }

    return {
        transformMp4: transformMp4
    };
}));
