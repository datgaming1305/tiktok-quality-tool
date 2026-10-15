/**
 * TikTok Video Container Optimizer - Frontend Controller
 */

document.addEventListener('DOMContentLoaded', () => {
    let selectedFile = null;
    let selectedMode = 'instant'; // 'instant' or 'compress'
    let ffmpegInstance = null;
    let currentVideoDurationSec = 0;
    let currentTargetBitrate = 3500;

    // DOM Elements
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('fileInput');
    const fileInfoBar = document.getElementById('fileInfoBar');
    const fileName = document.getElementById('fileName');
    const fileMeta = document.getElementById('fileMeta');
    const btnRemoveFile = document.getElementById('btnRemoveFile');
    const btnProcess = document.getElementById('btnProcess');

    const modeInstant = document.getElementById('modeInstant');
    const modeCompress = document.getElementById('modeCompress');
    const bitrateConfigCard = document.getElementById('bitrateConfigCard');
    const customBitrateInput = document.getElementById('customBitrateInput');
    const presetPills = document.querySelectorAll('.preset-pill');
    const denoiseToggle = document.getElementById('denoiseToggle');
    const sharpenToggle = document.getElementById('sharpenToggle');

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
        fileInput.value = '';
        dropzone.style.display = 'flex';
        fileInfoBar.style.display = 'none';
        btnProcess.disabled = true;
        resultCard.style.display = 'none';
        progressContainer.style.display = 'none';
    });

    function formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    function handleFileSelection(file) {
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
    }

    // Mode Selection
    modeInstant.addEventListener('click', () => {
        selectedMode = 'instant';
        modeInstant.classList.add('active');
        modeCompress.classList.remove('active');
        bitrateConfigCard.style.display = 'none';
    });

    modeCompress.addEventListener('click', () => {
        selectedMode = 'compress';
        modeCompress.classList.add('active');
        modeInstant.classList.remove('active');
        bitrateConfigCard.style.display = 'flex';
    });

    // Preset pills click
    presetPills.forEach(pill => {
        pill.addEventListener('click', (e) => {
            e.stopPropagation();
            presetPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            customBitrateInput.value = pill.getAttribute('data-val');
        });
    });

    customBitrateInput.addEventListener('input', () => {
        const val = customBitrateInput.value.trim();
        presetPills.forEach(p => {
            if (p.getAttribute('data-val') === val) {
                p.classList.add('active');
            } else {
                p.classList.remove('active');
            }
        });
    });

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

        try {
            if (selectedMode === 'instant') {
                await processInstantMode(selectedFile);
            } else {
                const targetBitrate = parseInt(customBitrateInput.value, 10) || 10000;
                await processCompressMode(selectedFile, targetBitrate);
            }
        } catch (error) {
            console.error(error);
            updateProgress(`Lỗi: ${error.message}`, 100);
            alert(`Có lỗi xảy ra trong quá trình xử lý: ${error.message}`);
            btnProcess.disabled = false;
        }
    });

    async function processInstantMode(file) {
        updateProgress("Đang đọc tệp video vào bộ nhớ...", 10);

        const arrayBuffer = await file.arrayBuffer();
        const inputBytes = new Uint8Array(arrayBuffer);

        const outputBytes = window.TikTokBypass.transformMp4(inputBytes, { multiplier: 10 }, (msg, pct) => {
            updateProgress(msg, pct);
        });

        finishProcessing(file, outputBytes);
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

    async function processCompressMode(file, targetBitrate) {
        updateProgress("Đang khởi tạo FFmpeg WebAssembly...", 5);

        currentVideoDurationSec = await getVideoDuration(file);
        currentTargetBitrate = targetBitrate;

        if (!ffmpegInstance) {
            const { FFmpeg } = window.FFmpegWASM;
            const { toBlobURL } = window.FFmpegUtil;

            ffmpegInstance = new FFmpeg();
            ffmpegInstance.on('log', ({ message }) => {
                logTerminal(`[ffmpeg] ${message}`);
            });
            ffmpegInstance.on('progress', ({ progress, time }) => {
                let ratio = 0;
                // Nếu progress hợp lệ (từ 0.0 đến 1.0)
                if (typeof progress === 'number' && !isNaN(progress) && progress >= 0 && progress <= 1) {
                    ratio = progress;
                } else if (typeof time === 'number' && currentVideoDurationSec > 0) {
                    // time là microseconds (10^-6 giây)
                    const currentTimeSec = time / 1000000;
                    ratio = Math.max(0, Math.min(1, currentTimeSec / currentVideoDurationSec));
                }

                const subPct = Math.round(ratio * 100);
                const overallPct = Math.min(80, Math.round(15 + ratio * 65));

                progressBar.style.width = `${overallPct}%`;
                progressPercent.textContent = `${overallPct}%`;
                progressText.textContent = `Đang nén video về ${currentTargetBitrate.toLocaleString()} kbps (${subPct}%)...`;
            });

            const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';

            updateProgress("Đang tải module FFmpeg Core WASM...", 10);
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

        const vfFilters = [];
        const isDenoise = denoiseToggle ? denoiseToggle.checked : true;
        const isSharpen = sharpenToggle ? sharpenToggle.checked : true;

        if (isDenoise) {
            vfFilters.push('hqdn3d=1.5:1.5:3:3');
        }
        if (isSharpen) {
            vfFilters.push('unsharp=5:5:0.8:5:5:0.0');
        }

        const filterSummary = [];
        if (isDenoise) filterSummary.push('Khử nhiễu hqdn3d');
        if (isSharpen) filterSummary.push('Làm nét unsharp');
        const filterText = filterSummary.length > 0 ? ` [${filterSummary.join(' + ')}]` : '';

        updateProgress(`Bắt đầu xử lý video về ${targetBitrate.toLocaleString()} kbps${filterText}...`, 20);

        const ffmpegArgs = [
            '-i', 'input.mp4'
        ];

        if (vfFilters.length > 0) {
            ffmpegArgs.push('-vf', vfFilters.join(','));
        }

        ffmpegArgs.push(
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-b:v', brStr,
            '-maxrate', brStr,
            '-bufsize', bufStr,
            '-pix_fmt', 'yuv420p',
            '-c:a', 'copy',
            'output_transcoded.mp4'
        );

        await ffmpegInstance.exec(ffmpegArgs);

        updateProgress("Đọc dữ liệu video đã nén...", 82);
        const transcodedData = await ffmpegInstance.readFile('output_transcoded.mp4');

        updateProgress("Đang tối ưu video...", 88);
        const outputBytes = window.TikTokBypass.transformMp4(new Uint8Array(transcodedData.buffer), { multiplier: 10 }, (msg, pct) => {
            const finalPct = Math.round(88 + (pct / 100) * 12);
            updateProgress(msg, finalPct);
        });

        finishProcessing(file, outputBytes);
    }

    function finishProcessing(origFile, outputBytes) {
        updateProgress("Hoàn tất xử lý.", 100);

        const blob = new Blob([outputBytes], { type: 'video/mp4' });
        const downloadUrl = URL.createObjectURL(blob);

        statOrigSize.textContent = formatBytes(origFile.size);
        statNewSize.textContent = formatBytes(outputBytes.length);

        const originalBase = origFile.name.replace(/\.[^/.]+$/, "");
        btnDownload.href = downloadUrl;
        btnDownload.download = `${originalBase}_tiktok_optimized.mp4`;

        resultCard.style.display = 'block';
        btnProcess.disabled = false;

        resultCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
});
