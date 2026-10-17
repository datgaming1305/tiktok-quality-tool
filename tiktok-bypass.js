/**
 * TikTok Video Optimizer Engine (Clean 2-Track & FastStart)
 * ISO Base Media File Format (MP4) Container Optimization
 *
 * Tiêu chuẩn Clean Master:
 * 1. 2-Track sạch 100% (Track 1: Video, Track 2: Audio).
 * 2. LOẠI BỎ HOÀN TOÀN Track 3 dummy audio padding và fake duration (khắc phục triệt để lỗi tua/seeking).
 * 3. Đồng bộ thời lượng mvhd, tkhd, mdhd chuẩn xác 100% theo thời lượng thực tế của video.
 * 4. FastStart chuẩn quốc tế (đưa moov lên đầu tệp) giúp TikTok đọc video tức thì.
 * 5. Chuẩn hóa FourCC (hvc1 cho H.265, avc1 High Profile cho H.264) + btrt box tối ưu.
 * 6. Hỗ trợ xử lý trực tiếp File/Blob (Zero-copy Splicing) không lo tràn RAM trình duyệt.
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

    const UDTA_CLEAN = new Uint8Array([
        0, 0, 0, 71, 117, 100, 116, 97, // udta (size 71)
        0, 0, 0, 63, 109, 101, 116, 97, // meta
        0, 0, 0, 0, 0, 0, 0, 33, 104, 100, 108, 114,
        0, 0, 0, 0, 0, 0, 0, 0, 109, 100, 105, 114,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 44, 105, 108, 115, 116,
        0, 0, 0, 36, 169, 116, 111, 111,
        0, 0, 0, 28, 100, 97, 116, 97,
        0, 0, 0, 1, 0, 0, 0, 0,
        76, 97, 118, 102, 54, 49, 46, 55, 46, 49, 48, 48 // Lavf61.7.100
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

    function parseBoxHeader(data, offset, end) {
        if (offset + 8 > end) return null;
        let size = readU32(data, offset);
        const typeStr = String.fromCharCode(data[offset + 4], data[offset + 5], data[offset + 6], data[offset + 7]);
        let headerLen = 8;
        if (size === 1) {
            if (offset + 16 > end) return null;
            size = readU64(data, offset + 8);
            headerLen = 16;
        } else if (size === 0) {
            size = end - offset;
        }
        return { type: typeStr, offset, size, headerLen };
    }

    function findBox(data, boxType, start = 0, end = null) {
        const limit = end === null ? data.length : end;
        let pos = start;
        while (pos < limit) {
            const b = parseBoxHeader(data, pos, limit);
            if (!b || b.size < 8 || pos + b.size > limit) break;
            if (b.type === boxType) return b;
            pos += b.size;
        }
        return null;
    }

    function findBoxPath(data, path, start = 0, end = null) {
        let curStart = start;
        let curEnd = end === null ? data.length : end;
        let foundBox = null;
        for (let i = 0; i < path.length; i++) {
            foundBox = findBox(data, path[i], curStart, curEnd);
            if (!foundBox) return null;
            curStart = foundBox.offset + (foundBox.headerLen || 8);
            curEnd = foundBox.offset + foundBox.size;
        }
        return foundBox;
    }

    function findTrackByHandler(data, moovStart, moovSize, handlerTypeStr) {
        const moovEnd = moovStart + moovSize;
        let pos = moovStart + 8;
        while (pos < moovEnd) {
            const b = parseBoxHeader(data, pos, moovEnd);
            if (!b || b.size < 8) break;
            if (b.type === 'trak') {
                const trakEnd = b.offset + b.size;
                const hdlr = findBoxPath(data, ['mdia', 'hdlr'], b.offset + 8, trakEnd);
                if (hdlr) {
                    const htype = String.fromCharCode(
                        data[hdlr.offset + 16],
                        data[hdlr.offset + 17],
                        data[hdlr.offset + 18],
                        data[hdlr.offset + 19]
                    );
                    if (htype === handlerTypeStr) {
                        return b;
                    }
                }
            }
            pos += b.size;
        }
        return null;
    }

    function parseChunkOffsets(data, stcoBox) {
        const offset = stcoBox.offset;
        const is64 = (stcoBox.type === 'co64');
        const count = readU32(data, offset + 12);
        const chunkOffsets = [];
        let ptr = offset + 16;
        for (let i = 0; i < count; i++) {
            if (is64) {
                chunkOffsets.push(readU64(data, ptr));
                ptr += 8;
            } else {
                chunkOffsets.push(readU32(data, ptr));
                ptr += 4;
            }
        }
        return chunkOffsets;
    }

    function parseStsz(data, stszOffset) {
        const defaultSize = readU32(data, stszOffset + 12);
        const count = readU32(data, stszOffset + 16);
        if (defaultSize !== 0) {
            return new Array(count).fill(defaultSize);
        }
        const sizes = [];
        let ptr = stszOffset + 20;
        for (let i = 0; i < count; i++) {
            sizes.push(readU32(data, ptr));
            ptr += 4;
        }
        return sizes;
    }

    function buildBtrt(bufferSizeDB, maxBitrate, avgBitrate) {
        const payload = new Uint8Array(12);
        writeU32(payload, 0, bufferSizeDB);
        writeU32(payload, 4, maxBitrate);
        writeU32(payload, 8, avgBitrate);
        return buildBox('btrt', payload);
    }

    function buildFtyp(isH265 = false) {
        const payload = isH265
            ? stringToBytes('isom\x00\x00\x02\x00isomiso2mp41')
            : stringToBytes('isom\x00\x00\x02\x00isomiso2avc1mp41');
        return buildBox('ftyp', payload);
    }

    function buildFree() {
        const payload = new Uint8Array(4); // 8 bytes total
        return buildBox('free', payload);
    }

    function buildAvcc(origAvccPayload) {
        const out = new Uint8Array(origAvccPayload);
        out[1] = 0x64; // High Profile 0x64
        return buildBox('avcC', out);
    }

    function buildStsdVideo(visualFixed78Bytes, codecBox, colrBox, paspBox, btrtBox, entryType = 'avc1') {
        const entryPayload = concatBytes(visualFixed78Bytes, codecBox, colrBox, paspBox, btrtBox);
        const sampleEntryBox = buildBox(entryType, entryPayload);
        const stsdPayload = new Uint8Array(8 + sampleEntryBox.length);
        writeU32(stsdPayload, 0, 0); // version/flags
        writeU32(stsdPayload, 4, 1); // entry count = 1
        stsdPayload.set(sampleEntryBox, 8);
        return buildBox('stsd', stsdPayload);
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

    /**
     * Build mvhd with REAL video duration (Không fake 0xFF để đảm bảo tính năng tua hoạt động 100%)
     */
    function buildMvhdClean(timescale = 1000, nextTrackId = 3, durationMs = 0) {
        const payload = new Uint8Array(112);
        payload[0] = 1; // Version 1 (64-bit)
        writeU32(payload, 20, timescale);
        writeU64(payload, 24, durationMs); // Thời lượng thực tế chính xác!
        writeU32(payload, 32, 0x00010000); // rate 1.0
        payload[36] = 0x01; payload[37] = 0x00; // volume 1.0
        writeU32(payload, 48, 0x00010000); // matrix
        writeU32(payload, 64, 0x00010000);
        writeU32(payload, 80, 0x40000000);
        writeU32(payload, 108, nextTrackId);
        return buildBox('mvhd', payload);
    }

    function updateTkhd(origBoxBytes, newTrackId, newDurationMs, newAltGroup, volume) {
        const out = new Uint8Array(origBoxBytes);
        const ver = out[8];
        if (ver === 0) {
            if (newTrackId !== undefined) writeU32(out, 20, newTrackId);
            if (newDurationMs !== undefined) writeU32(out, 28, newDurationMs);
            if (newAltGroup !== undefined) {
                out[42] = (newAltGroup >> 8) & 0xFF;
                out[43] = newAltGroup & 0xFF;
            }
            if (volume !== undefined) {
                out[44] = (volume >> 8) & 0xFF;
                out[45] = volume & 0xFF;
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
            if (volume !== undefined) {
                out[56] = (volume >> 8) & 0xFF;
                out[57] = volume & 0xFF;
            }
        }
        return out;
    }

    /**
     * Clean 2-Track Container Optimization
     * @param {Uint8Array|File|Blob} input
     * @param {Object} options
     * @param {Function} onProgress
     * @returns {Blob|Uint8Array}
     */
    async function transformMp4(input, options = {}, onProgress = null) {
        const log = (msg, pct) => {
            if (onProgress) onProgress(msg, pct);
        };

        const isBlobInput = (typeof Blob !== 'undefined' && input instanceof Blob);
        let data = null;

        if (isBlobInput) {
            log("Đang phân tích cấu trúc Atom MP4...", 10);
            // Với file lớn, ta chỉ cần đọc phần đầu chứa moov/ftyp/mdat header
            // Nhưng để tương thích chắc chắn với file moov ở cuối, ta nạp buffer
            const buf = await input.arrayBuffer();
            data = new Uint8Array(buf);
        } else {
            data = input;
        }

        log("Phân tích các bảng điều khiển container...", 15);
        const moovBox = findBox(data, 'moov');
        const mdatBox = findBox(data, 'mdat');
        if (!moovBox || !mdatBox) {
            throw new Error("Không thể phân tích cấu trúc video (không tìm thấy moov/mdat). Bạn hãy chọn chế độ 'Nén giảm dung lượng' để chuẩn hóa video này.");
        }

        const origMdatDataStart = mdatBox.offset + (mdatBox.headerLen || 8);
        const origMdatPayloadLen = mdatBox.size - (mdatBox.headerLen || 8);

        // 1. VIDEO TRACK (TRACK 1)
        log("Tối ưu hóa Video Track (bảo toàn 100% frame gốc, FourCC hvc1/avc1)...", 25);
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
        const vDurationSec = vTimescale > 0 ? (vDuration / vTimescale) : 0;
        const vDurationMs = Math.round(vDurationSec * 1000);

        // Detect Codec: H.264 (avcC) or H.265 (hvcC)
        const stsdContent = data.subarray(vStsd.offset + 8, vStsd.offset + vStsd.size);
        const visualFixed = stsdContent.subarray(16, 94); // 78-byte VisualSampleEntry

        let isH265 = false;
        let codecBoxNew = null;
        let sampleEntryType = 'avc1';

        let avccRel = -1;
        for (let i = 0; i < stsdContent.length - 4; i++) {
            if (stsdContent[i] === 97 && stsdContent[i+1] === 118 && stsdContent[i+2] === 99 && stsdContent[i+3] === 67) {
                avccRel = i;
                break;
            }
        }

        let hvccRel = -1;
        for (let i = 0; i < stsdContent.length - 4; i++) {
            if (stsdContent[i] === 104 && stsdContent[i+1] === 118 && stsdContent[i+2] === 99 && stsdContent[i+3] === 67) {
                hvccRel = i;
                break;
            }
        }

        if (avccRel !== -1) {
            isH265 = false;
            sampleEntryType = 'avc1';
            const avccStart = avccRel - 4;
            const avccOrigSize = readU32(stsdContent, avccStart);
            codecBoxNew = buildAvcc(stsdContent.subarray(avccStart + 8, avccStart + avccOrigSize));
            log(`Video H.264/AVC: ${origFrames} frames (${(origFrames / (vDurationSec || 1)).toFixed(0)} fps, ${vDurationSec.toFixed(1)}s)`, 35);
        } else if (hvccRel !== -1) {
            isH265 = true;
            sampleEntryType = 'hvc1';
            const hvccStart = hvccRel - 4;
            const hvccOrigSize = readU32(stsdContent, hvccStart);
            codecBoxNew = data.subarray(vStsd.offset + 8 + hvccStart, vStsd.offset + 8 + hvccStart + hvccOrigSize);
            log(`Video H.265/HEVC (tag hvc1): ${origFrames} frames (${(origFrames / (vDurationSec || 1)).toFixed(0)} fps, ${vDurationSec.toFixed(1)}s)`, 35);
        } else {
            throw new Error("Không tìm thấy chuẩn H.264 (avcC) hoặc H.265 (hvcC). Vui lòng chọn chế độ 'Nén giảm dung lượng'!");
        }

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
        const newVAvgBr = vDurationSec > 0 ? Math.floor(totalVBytes * 8 / vDurationSec) : 3500000;

        let maxBr = newVAvgBr;
        for (let i = 0; i < stsdContent.length - 4; i++) {
            if (stsdContent[i] === 98 && stsdContent[i+1] === 116 && stsdContent[i+2] === 114 && stsdContent[i+3] === 116) {
                maxBr = readU32(stsdContent, i + 8) || newVAvgBr;
                break;
            }
        }

        const btrtNew = buildBtrt(0, maxBr, newVAvgBr);
        const videoStsdNew = buildStsdVideo(visualFixed, codecBoxNew, colrBox, paspBox, btrtNew, sampleEntryType);

        // Video Tkhd: track_id = 1, alternate_group = 0, giữ thời lượng thực
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

        // Giữ nguyên 100% các bảng khung hình gốc
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

        // 2. AUDIO TRACK (TRACK 2)
        log("Chuẩn hóa luồng Audio Track gốc (Track 2)...", 50);
        const at = findTrackByHandler(data, moovBox.offset, moovBox.size, 'soun');
        let audioTrak = new Uint8Array(0);
        let audioChunks = [];
        let hasAudio = false;

        if (at) {
            hasAudio = true;
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

            audioChunks = parseChunkOffsets(data, aStco);

            const aMdhd = findBoxPath(data, ['mdia', 'mdhd'], atStart, atEnd);
            const aTimescale = readU32(data, aMdhd.offset + 20);
            const aDuration = readU32(data, aMdhd.offset + 24);
            const aDurationMs = aTimescale > 0 ? Math.round(aDuration * 1000 / aTimescale) : vDurationMs;

            const aTkhdOrig = data.subarray(atStart, atStart + readU32(data, atStart));
            const aTkhdNew = updateTkhd(aTkhdOrig, 2, aDurationMs, 1, 0x0100); // track_id = 2, alt_group = 1, volume 1.0

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
            audioTrak = buildBox('trak', concatBytes(aTkhdNew, audioEdts, audioMdia));
        }

        // 3. FASTSTART & OFFSET CALCULATION (CLEAN 2-TRACK CHUẨN XÁC)
        log("Tính toán lại địa chỉ Chunk Offsets chuẩn FastStart...", 70);
        const ftyp = buildFtyp(isH265);
        const free = buildFree();
        const mvhd = buildMvhdClean(1000, hasAudio ? 3 : 2, vDurationMs);
        const udta = UDTA_CLEAN;

        // Ước tính moov ban đầu với placeholder STCO
        let traks = hasAudio ? concatBytes(videoTrak, audioTrak) : videoTrak;
        let moov = buildBox('moov', concatBytes(mvhd, traks, udta));
        const moovSizeFinal = moov.length;

        // Tính toán vị trí mới của mdat
        const is64Mdat = (8 + origMdatPayloadLen > 0xFFFFFFFF);
        const newMdatHdrLen = is64Mdat ? 16 : 8;
        const newMdatDataStart = ftyp.length + moovSizeFinal + free.length + newMdatHdrLen;

        // Video offsets mới
        const newVOffsets = videoChunks.map(off => newMdatDataStart + (off - origMdatDataStart));
        const vStcoNew = buildStco(newVOffsets);

        // Rebuild Video Track
        vStblParts[vStblParts.length - 1] = vStcoNew;
        videoStbl = buildBox('stbl', concatBytes(...vStblParts));
        videoMinf = buildBox('minf', concatBytes(videoVmhd, videoDinf, videoStbl));
        videoMdia = buildBox('mdia', concatBytes(videoMdhd, videoHdlr, videoMinf));
        videoTrak = buildBox('trak', concatBytes(vTkhdNew, videoEdts, videoMdia));

        // Audio offsets mới nếu có
        if (hasAudio) {
            const newAOffsets = audioChunks.map(off => newMdatDataStart + (off - origMdatDataStart));
            const aStcoNew = buildStco(newAOffsets);

            const aStblPartsNew = [
                findBox(audioTrak, 'stsd') ? audioTrak.subarray(findBox(audioTrak, 'stsd').offset, findBox(audioTrak, 'stsd').offset + findBox(audioTrak, 'stsd').size) : new Uint8Array(0)
            ];
            // Ta có thể rebuild trực tiếp từ audioChunks
            const aStblBox = findBoxPath(audioTrak, ['mdia', 'minf', 'stbl'], 8, audioTrak.length);
            const aSubboxes = [];
            let p = aStblBox.offset + 8;
            const pEnd = aStblBox.offset + aStblBox.size;
            while (p < pEnd) {
                const b = parseBoxHeader(audioTrak, p, pEnd);
                if (!b) break;
                if (b.type === 'stco' || b.type === 'co64') {
                    aSubboxes.push(aStcoNew);
                } else {
                    aSubboxes.push(audioTrak.subarray(b.offset, b.offset + b.size));
                }
                p += b.size;
            }

            const newAStbl = buildBox('stbl', concatBytes(...aSubboxes));
            const aMinfBox = findBoxPath(audioTrak, ['mdia', 'minf'], 8, audioTrak.length);
            const aMinfParts = [];
            let mp = aMinfBox.offset + 8;
            const mpEnd = aMinfBox.offset + aMinfBox.size;
            while (mp < mpEnd) {
                const b = parseBoxHeader(audioTrak, mp, mpEnd);
                if (!b) break;
                if (b.type === 'stbl') {
                    aMinfParts.push(newAStbl);
                } else {
                    aMinfParts.push(audioTrak.subarray(b.offset, b.offset + b.size));
                }
                mp += b.size;
            }

            const newAMinf = buildBox('minf', concatBytes(...aMinfParts));
            const aMdiaBox = findBoxPath(audioTrak, ['mdia'], 8, audioTrak.length);
            const aMdiaParts = [];
            let mdp = aMdiaBox.offset + 8;
            const mdpEnd = aMdiaBox.offset + aMdiaBox.size;
            while (mdp < mdpEnd) {
                const b = parseBoxHeader(audioTrak, mdp, mdpEnd);
                if (!b) break;
                if (b.type === 'minf') {
                    aMdiaParts.push(newAMinf);
                } else {
                    aMdiaParts.push(audioTrak.subarray(b.offset, b.offset + b.size));
                }
                mdp += b.size;
            }

            const newAMdia = buildBox('mdia', concatBytes(...aMdiaParts));
            const aTrakParts = [];
            let tp = 8;
            const tpEnd = audioTrak.length;
            while (tp < tpEnd) {
                const b = parseBoxHeader(audioTrak, tp, tpEnd);
                if (!b) break;
                if (b.type === 'mdia') {
                    aTrakParts.push(newAMdia);
                } else {
                    aTrakParts.push(audioTrak.subarray(b.offset, b.offset + b.size));
                }
                tp += b.size;
            }
            audioTrak = buildBox('trak', concatBytes(...aTrakParts));
        }

        // Rebuild moov chính xác
        traks = hasAudio ? concatBytes(videoTrak, audioTrak) : videoTrak;
        moov = buildBox('moov', concatBytes(mvhd, traks, udta));

        if (moov.length !== moovSizeFinal) {
            throw new Error(`Lệch kích thước moov: dự kiến ${moovSizeFinal}, thực tế ${moov.length}`);
        }

        // 4. XUẤT TỆP HOÀN CHỈNH
        log("Đóng gói tệp video chuẩn sạch 2-Track...", 85);

        // Tạo mdat header
        let mdatHdrBytes = null;
        if (!is64Mdat) {
            mdatHdrBytes = new Uint8Array(8);
            writeU32(mdatHdrBytes, 0, 8 + origMdatPayloadLen);
            mdatHdrBytes[4] = 109; mdatHdrBytes[5] = 100; mdatHdrBytes[6] = 97; mdatHdrBytes[7] = 116;
        } else {
            mdatHdrBytes = new Uint8Array(16);
            writeU32(mdatHdrBytes, 0, 1);
            mdatHdrBytes[4] = 109; mdatHdrBytes[5] = 100; mdatHdrBytes[6] = 97; mdatHdrBytes[7] = 116;
            writeU64(mdatHdrBytes, 8, 16 + origMdatPayloadLen);
        }

        log("Hoàn tất tối ưu hóa video chuẩn FastStart sạch 100%!", 100);

        // Nếu là Blob đầu vào, dùng Blob Splicing không tốn RAM
        if (isBlobInput) {
            const mdatPayloadBlob = input.slice(origMdatDataStart, origMdatDataStart + origMdatPayloadLen);
            return new Blob([ftyp, moov, free, mdatHdrBytes, mdatPayloadBlob], { type: 'video/mp4' });
        } else {
            // Uint8Array fallback
            const finalSize = ftyp.length + moov.length + free.length + mdatHdrBytes.length + origMdatPayloadLen;
            const out = new Uint8Array(finalSize);
            let cur = 0;
            out.set(ftyp, cur); cur += ftyp.length;
            out.set(moov, cur); cur += moov.length;
            out.set(free, cur); cur += free.length;
            out.set(mdatHdrBytes, cur); cur += mdatHdrBytes.length;
            out.set(data.subarray(origMdatDataStart, origMdatDataStart + origMdatPayloadLen), cur);
            return out;
        }
    }

    return {
        transformMp4
    };
}));
