/**
 * TikTok Quality Bypass Tool - Frontend App Controller
 */

document.addEventListener('DOMContentLoaded', () => {
    let selectedFile = null;
    let selectedMode = 'instant'; // 'instant' or 'compress'
    let ffmpegInstance = null;

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
    });

    modeCompress.addEventListener('click', () => {
        selectedMode = 'compress';
        modeCompress.classList.add('active');
        modeInstant.classList.remove('active');
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
                await processCompressMode(selectedFile);
            }
        } catch (error) {
            console.error(error);
            updateProgress(`Lỗi: ${error.message}`, 100);
            alert(`Có lỗi xảy ra trong quá trình xử lý: ${error.message}`);
            btnProcess.disabled = false;
        }
    });

    async function processInstantMode(file) {
        updateProgress("Đang đọc tệp video vào bộ nhớ RAM...", 5);

        const arrayBuffer = await file.arrayBuffer();
        const inputBytes = new Uint8Array(arrayBuffer);

        // Run transformation
        const outputBytes = window.TikTokBypass.transformMp4(inputBytes, { multiplier: 10 }, (msg, pct) => {
            updateProgress(msg, pct);
        });

        finishProcessing(file, outputBytes);
    }

    async function processCompressMode(file) {
        updateProgress("Đang tải thư viện FFmpeg WebAssembly từ CDN...", 5);

        // Dynamically load ffmpeg if not loaded
        if (!ffmpegInstance) {
            await loadScript('https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/umd/ffmpeg.js');
            await loadScript('https://unpkg.com/@ffmpeg/util@0.12.1/dist/umd/index.js');

            const { FFmpeg } = window.FFmpegWASM;
            const { toBlobURL } = window.FFmpegUtil;

            ffmpegInstance = new FFmpeg();
            ffmpegInstance.on('log', ({ message }) => {
                logTerminal(`[ffmpeg] ${message}`);
            });
            ffmpegInstance.on('progress', ({ progress }) => {
                const pct = Math.min(80, Math.round(15 + progress * 65));
                progressBar.style.width = `${pct}%`;
                progressPercent.textContent = `${pct}%`;
                progressText.textContent = `Đang nén video về 10 Mbps (${(progress * 100).toFixed(0)}%)...`;
            });

            const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
            await ffmpegInstance.load({
                coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
                wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm')
            });
        }

        updateProgress("Đang nạp video vào bộ nhớ FFmpeg...", 15);
        const { fetchFile } = window.FFmpegUtil;
        await ffmpegInstance.writeFile('input.mp4', await fetchFile(file));

        updateProgress("Bắt đầu nén luồng video về 10,000 kbps...", 20);
        await ffmpegInstance.exec([
            '-i', 'input.mp4',
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-b:v', '10000k',
            '-maxrate', '10000k',
            '-bufsize', '20000k',
            '-c:a', 'copy',
            'output_transcoded.mp4'
        ]);

        updateProgress("Đọc dữ liệu video đã nén...", 82);
        const transcodedData = await ffmpegInstance.readFile('output_transcoded.mp4');

        // Now run the bypass
        updateProgress("Thực thi chuỗi thuật toán TikTok Quality Bypass...", 88);
        const outputBytes = window.TikTokBypass.transformMp4(new Uint8Array(transcodedData.buffer), { multiplier: 10 }, (msg, pct) => {
            const finalPct = Math.round(88 + (pct / 100) * 12);
            updateProgress(msg, finalPct);
        });

        finishProcessing(file, outputBytes);
    }

    function finishProcessing(origFile, outputBytes) {
        updateProgress("Đã hoàn tất 100%!", 100);

        const blob = new Blob([outputBytes], { type: 'video/mp4' });
        const downloadUrl = URL.createObjectURL(blob);

        statOrigSize.textContent = formatBytes(origFile.size);
        statNewSize.textContent = formatBytes(outputBytes.length);

        const originalBase = origFile.name.replace(/\.[^/.]+$/, "");
        btnDownload.href = downloadUrl;
        btnDownload.download = `${originalBase}_tiktok_bypass.mp4`;

        resultCard.style.display = 'block';
        btnProcess.disabled = false;

        resultCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${src}"]`)) {
                return resolve();
            }
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }
});
