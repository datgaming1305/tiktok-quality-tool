/**
 * TikTok Video Container Optimizer - Frontend Controller
 * Chế độ: Tự Động Tối Ưu Thông Minh (Chuẩn TikQuick Safe Cap)
 * - Tự động kiểm tra trần an toàn của TikTok
 * - Dung lượng <= trần: Giữ 100% bitrate gốc không nén (FastStart 0.1s)
 * - Dung lượng > trần: Tự động hạ nhẹ bitrate về ngưỡng tối ưu để tránh bị TikTok bóp chất lượng
 * - Khắc phục 100% lỗi tua video (Clean 2-Track, thời lượng thực tế)
 */

document.addEventListener('DOMContentLoaded', () => {
    let selectedFile = null;
    let selectedVideoDuration = 0;
    let ffmpegInstance = null;

    // DOM Elements
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('fileInput');
    const fileInfoBar = document.getElementById('fileInfoBar');
    const fileName = document.getElementById('fileName');
    const fileMeta = document.getElementById('fileMeta');
    const btnRemoveFile = document.getElementById('btnRemoveFile');
    const btnProcess = document.getElementById('btnProcess');
    const smartCapStatus = document.getElementById('smartCapStatus');
    const forcePassthroughToggle = document.getElementById('forcePassthroughToggle');

    const progressContainer = document.getElementById('progressContainer');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const progressPercent = document.getElementById('progressPercent');
    const terminalBox = document.getElementById('terminalBox');

    const resultCard = document.getElementById('resultCard');
    const statOrigSize = document.getElementById('statOrigSize');
    const statNewSize = document.getElementById('statNewSize');
    const btnDownload = document.getElementById('btnDownload');

    // Drag & Drop handlers
    dropzone.addEventListener('click', () => fileInput.click());

    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropzone.classList.add('dragover');
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropzone.classList.remove('dragover');
        });
    });

    dropzone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            handleFileSelection(files[0]);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            handleFileSelection(e.target.files[0]);
        }
    });

    btnRemoveFile.addEventListener('click', () => {
        selectedFile = null;
        selectedVideoDuration = 0;
        fileInput.value = '';
        dropzone.style.display = 'flex';
        fileInfoBar.style.display = 'none';
        btnProcess.disabled = true;
        resultCard.style.display = 'none';
        progressContainer.style.display = 'none';
        if (smartCapStatus) smartCapStatus.style.display = 'none';
    });

    if (forcePassthroughToggle) {
        forcePassthroughToggle.addEventListener('change', () => {
            updateSmartCapBadge();
        });
    }

    function formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    function formatDuration(sec) {
        if (!sec || isNaN(sec)) return "00:00";
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    function getVideoDuration(file) {
        return new Promise((resolve) => {
            const tempVideo = document.createElement('video');
            tempVideo.preload = 'metadata';
            const url = URL.createObjectURL(file);
            tempVideo.onloadedmetadata = () => {
                URL.revokeObjectURL(url);
                resolve(tempVideo.duration || 0);
            };
            tempVideo.onerror = () => {
                URL.revokeObjectURL(url);
                resolve(0);
            };
            tempVideo.src = url;
        });
    }

    // Thuật toán xác định trần an toàn của TikTok (Chuẩn TikQuick)
    function getTikQuickThreshold(duration) {
        if (duration < 20) return 32505856;  // ~31.0 MB
        if (duration < 60) return 53477376;  // ~51.0 MB
        if (duration < 120) return 95420416; // ~91.0 MB
        return 126877696;                    // ~121.0 MB
    }

    // Công thức tính bitrate mục tiêu của TikQuick
    function calculateSafeBitrate(duration, targetBytes) {
        const d = Math.max(1, duration);
        const bps = Math.max(500000, Math.floor(((targetBytes * 8) / d) - 128000));
        return Math.round(bps / 1000); // kbps
    }

    function updateSmartCapBadge() {
        if (!selectedFile || !smartCapStatus) return;

        const duration = selectedVideoDuration || 0;
        const threshold = getTikQuickThreshold(duration);
        const isExceeded = selectedFile.size > threshold;
        const isForced = forcePassthroughToggle ? forcePassthroughToggle.checked : false;

        smartCapStatus.style.display = 'block';

        const durStr = formatDuration(duration);
        const sizeStr = formatBytes(selectedFile.size);
        const threshStr = formatBytes(threshold);

        if (isForced) {
            smartCapStatus.innerHTML = `
                <div style="font-weight: 600; color: #ffeb3b; margin-bottom: 4px;">⚡ Đã bật ép giữ 100% Bitrate gốc:</div>
                <div>Thời lượng: <strong>${durStr}</strong> | Dung lượng: <strong>${sizeStr}</strong>. Sẽ bảo toàn 100% khung hình và bitrate gốc, không nén lại dù vượt trần an toàn.</div>
            `;
        } else if (isExceeded) {
            const targetKbps = calculateSafeBitrate(duration, threshold);
            smartCapStatus.innerHTML = `
                <div style="font-weight: 600; color: #25f4ee; margin-bottom: 4px;">⚠️ Vượt trần an toàn TikTok: Tự động hạ nhẹ Bitrate (Chuẩn TikQuick)</div>
                <div>Thời lượng: <strong>${durStr}</strong> | Dung lượng: <strong>${sizeStr}</strong> (Trần an toàn: <strong>${threshStr}</strong>).</div>
                <div style="margin-top: 4px; font-size: 12px; color: #cbd5e1;">Hệ thống sẽ nén nhẹ về <strong>~${targetKbps.toLocaleString()} kbps</strong> (~${threshStr}) để video không bị máy chủ TikTok bóp mờ khi đăng.</div>
            `;
        } else {
            smartCapStatus.innerHTML = `
                <div style="font-weight: 600; color: #10b981; margin-bottom: 4px;">✅ Nằm trong trần an toàn TikTok: Bảo toàn 100% Bitrate gốc</div>
                <div>Thời lượng: <strong>${durStr}</strong> | Dung lượng: <strong>${sizeStr}</strong> (Trần an toàn: <strong>${threshStr}</strong>).</div>
                <div style="margin-top: 4px; font-size: 12px; color: #cbd5e1;">Video đạt chuẩn an toàn của TikTok, sẽ giữ nguyên 100% độ nét gốc và xử lý siêu tốc trong 0.1s!</div>
            `;
        }
    }

    async function handleFileSelection(file) {
        if (!file.name.toLowerCase().endsWith('.mp4')) {
            alert('Vui lòng chọn tệp định dạng .mp4!');
            return;
        }

        selectedFile = file;
        fileName.textContent = file.name;
        fileMeta.textContent = formatBytes(file.size);

        dropzone.style.display = 'none';
        fileInfoBar.style.display = 'flex';
        btnProcess.disabled = false;
        resultCard.style.display = 'none';
        progressContainer.style.display = 'none';

        // Lấy thời lượng video
        selectedVideoDuration = await getVideoDuration(file);
        updateSmartCapBadge();
    }

    function logTerminal(message) {
        const line = document.createElement('div');
        line.textContent = `> ${message}`;
        terminalBox.appendChild(line);
        terminalBox.scrollTop = terminalBox.scrollHeight;
    }

    function updateProgress(message, percent) {
        progressBar.style.width = `${percent}%`;
        progressPercent.textContent = `${percent}%`;
        progressText.textContent = message;
        logTerminal(message);
    }

    // Process Action
    btnProcess.addEventListener('click', async () => {
        if (!selectedFile) return;

        btnProcess.disabled = true;
        resultCard.style.display = 'none';
        progressContainer.style.display = 'block';
        terminalBox.innerHTML = '';

        const duration = selectedVideoDuration || 0;
        const threshold = getTikQuickThreshold(duration);
        const isExceeded = selectedFile.size > threshold;
        const isForced = forcePassthroughToggle ? forcePassthroughToggle.checked : false;

        try {
            if (!isExceeded || isForced) {
                // Passthrough tức thì (0.1s)
                await processInstantMode(selectedFile);
            } else {
                // Tự động hạ nhẹ bitrate theo TikQuick
                const targetBitrate = calculateSafeBitrate(duration, threshold);
                await processTikQuickSafeCap(selectedFile, targetBitrate, duration);
            }
        } catch (error) {
            console.error(error);
            updateProgress(`Lỗi: ${error.message}`, 100);
            alert(`Có lỗi xảy ra trong quá trình xử lý: ${error.message}\nNếu nén WASM không khả dụng trên trình duyệt của bạn, bạn có thể tick chọn "Ép buộc giữ 100% bitrate gốc" để xử lý tức thì.`);
            btnProcess.disabled = false;
        }
    });

    async function processInstantMode(file) {
        updateProgress("Đang phân tích cấu trúc video và chuẩn hóa FastStart...", 20);
        const output = await window.TikTokBypass.transformMp4(file, {}, (msg, pct) => {
            updateProgress(msg, pct);
        });
        finishProcessing(file, output);
    }

    async function processTikQuickSafeCap(file, targetBitrate, duration) {
        updateProgress("Khởi tạo module FFmpeg WebAssembly...", 5);

        try {
            if (!ffmpegInstance) {
                if (!window.FFmpegWASM || !window.FFmpegUtil) {
                    throw new Error("Không tìm thấy thư viện FFmpeg WASM cục bộ!");
                }
                const { FFmpeg } = window.FFmpegWASM;
                const { toBlobURL } = window.FFmpegUtil;

                ffmpegInstance = new FFmpeg();
                ffmpegInstance.on('log', ({ message }) => {
                    logTerminal(`[ffmpeg] ${message}`);
                });
                ffmpegInstance.on('progress', ({ progress, time }) => {
                    let ratio = 0;
                    if (typeof progress === 'number' && !isNaN(progress) && progress >= 0 && progress <= 1) {
                        ratio = progress;
                    } else if (typeof time === 'number' && duration > 0) {
                        const currentTimeSec = time / 1000000;
                        ratio = Math.max(0, Math.min(1, currentTimeSec / duration));
                    }

                    const currentPct = Math.min(85, Math.round(15 + ratio * 70));
                    progressBar.style.width = `${currentPct}%`;
                    progressPercent.textContent = `${currentPct}%`;
                    progressText.textContent = `Đang nén nhẹ về ${targetBitrate.toLocaleString()} kbps (${currentPct}%)...`;
                });

                const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
                updateProgress("Tải tệp lõi FFmpeg Core WASM...", 10);
                await ffmpegInstance.load({
                    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
                    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm')
                });
            }

            updateProgress("Nạp dữ liệu video vào bộ nhớ ảo...", 15);
            const { fetchFile } = window.FFmpegUtil;
            await ffmpegInstance.writeFile('input.mp4', await fetchFile(file));

            const brStr = `${targetBitrate}k`;
            const bufStr = `${targetBitrate * 2}k`;

            updateProgress(`Bắt đầu hạ nhẹ bitrate về ${targetBitrate.toLocaleString()} kbps (Chuẩn TikQuick)...`, 20);

            const ffmpegArgs = [
                '-i', 'input.mp4',
                '-c:v', 'libx264',
                '-preset', 'fast',
                '-b:v', brStr,
                '-maxrate', brStr,
                '-bufsize', bufStr,
                '-pix_fmt', 'yuv420p',
                '-c:a', 'copy',
                'output_transcoded.mp4'
            ];

            await ffmpegInstance.exec(ffmpegArgs);

            updateProgress("Đọc dữ liệu video đã tối ưu...", 86);
            const transcodedData = await ffmpegInstance.readFile('output_transcoded.mp4');

            try {
                await ffmpegInstance.deleteFile('input.mp4');
                await ffmpegInstance.deleteFile('output_transcoded.mp4');
            } catch (e) {}

            updateProgress("Đang hoàn thiện cấu trúc FastStart...", 90);
            const output = await window.TikTokBypass.transformMp4(new Blob([transcodedData.buffer], { type: 'video/mp4' }), {}, (msg, pct) => {
                const finalPct = Math.round(90 + (pct / 100) * 10);
                updateProgress(msg, finalPct);
            });

            finishProcessing(file, output);

        } catch (err) {
            console.warn("FFmpeg WASM error, fallback to instant mode:", err);
            logTerminal(`[Cảnh báo] Không thể chạy bộ nén WASM (${err.message}). Tự động chuyển sang chế độ Bảo toàn Bitrate gốc...`);
            await processInstantMode(file);
        }
    }

    function finishProcessing(origFile, output) {
        updateProgress("Hoàn tất xử lý.", 100);

        const blob = (output instanceof Blob) ? output : new Blob([output], { type: 'video/mp4' });
        const downloadUrl = URL.createObjectURL(blob);

        statOrigSize.textContent = formatBytes(origFile.size);
        statNewSize.textContent = formatBytes(blob.size);

        const originalBase = origFile.name.replace(/\.[^/.]+$/, "");
        btnDownload.href = downloadUrl;
        btnDownload.download = `${originalBase}-optimize.mp4`;

        resultCard.style.display = 'block';
        btnProcess.disabled = false;

        resultCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
});
