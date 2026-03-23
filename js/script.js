// 全局状态
let file1Data = null; // { sheetName: [rows] }
let file2Data = null; // { sheetName: [rows] }
let currentSheetIndex = 0;
let commonSheets = []; // 两个文件共有的 sheet 名
let sheetConfigs = {}; // { sheetName: { keys: ['id', 'name'] } }
let isFullscreen = false;
let isLayoutLR = true; // Left-Right layout

// DOM 元素引用
const drop1 = document.getElementById('drop-1');
const drop2 = document.getElementById('drop-2');
const startBtn = document.getElementById('start-btn');
const uploadSection = document.getElementById('upload-section');
const resultSection = document.getElementById('result-section');
const modalOverlay = document.getElementById('key-modal');
const modalSheetName = document.getElementById('modal-sheet-name');
const keyOptionsContainer = document.getElementById('key-options');
const confirmKeyBtn = document.getElementById('confirm-key-btn');
const applyAllCheck = document.getElementById('apply-all-check');

const wrapperLeft = document.getElementById('wrapper-left');
const wrapperRight = document.getElementById('wrapper-right');
const floatingNav = document.getElementById('floating-nav');
const backToToolboxBtn = document.querySelector('.back-btn');
const backToUploadBtn = document.getElementById('back-to-upload-btn');
const restoreHint = document.getElementById('restore-hint');
const currentLeftFileInfo = document.getElementById('current-left-file-info');
const currentRightFileInfo = document.getElementById('current-right-file-info');
const input1 = document.getElementById('file-input-1');
const input2 = document.getElementById('file-input-2');

const DEFAULT_PAGE_TITLE = document.title;
const CACHE_DB_NAME = 'excel-compare-cache-db';
const CACHE_STORE_NAME = 'excelCompare';
const CACHE_KEY = 'latest';
const MAX_SINGLE_CACHE_BYTES = 30 * 1024 * 1024;
const MAX_TOTAL_CACHE_BYTES = 60 * 1024 * 1024;
let cacheSaveTimer = null;

const uploadSlotRefs = {
    left: {
        dropZone: drop1,
        fileNameEl: document.getElementById('name-1'),
        statusEl: document.getElementById('status-1'),
        percentEl: document.getElementById('percent-1'),
        progressBarEl: document.getElementById('progress-1')
    },
    right: {
        dropZone: drop2,
        fileNameEl: document.getElementById('name-2'),
        statusEl: document.getElementById('status-2'),
        percentEl: document.getElementById('percent-2'),
        progressBarEl: document.getElementById('progress-2')
    }
};

const uploadSlotState = {
    left: { status: 'idle', progress: 0, fileName: '', fileSize: 0, type: '', lastModified: 0, buffer: null, message: '', parseTimer: null, taskId: 0 },
    right: { status: 'idle', progress: 0, fileName: '', fileSize: 0, type: '', lastModified: 0, buffer: null, message: '', parseTimer: null, taskId: 0 }
};

function clampProgress(value) {
    return Math.max(0, Math.min(100, Math.round(value || 0)));
}

function formatFileSize(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let idx = 0;
    while (size >= 1024 && idx < units.length - 1) {
        size /= 1024;
        idx++;
    }
    const precision = idx === 0 ? 0 : (size >= 100 ? 0 : (size >= 10 ? 1 : 2));
    return size.toFixed(precision) + ' ' + units[idx];
}

function formatDateTime(ts) {
    if (!Number.isFinite(ts)) return '';
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getCurrentFilePairNames() {
    const leftName = (uploadSlotState.left.fileName || '').trim();
    const rightName = (uploadSlotState.right.fileName || '').trim();
    return { leftName, rightName };
}

function updateFileIdentityUI() {
    const { leftName, rightName } = getCurrentFilePairNames();
    if (currentLeftFileInfo) currentLeftFileInfo.textContent = leftName ? `${leftName} (Left)` : '';
    if (currentRightFileInfo) currentRightFileInfo.textContent = rightName ? `${rightName} (Right)` : '';

    if (leftName && rightName) {
        document.title = `${leftName} vs ${rightName} - ${DEFAULT_PAGE_TITLE}`;
    } else if (leftName || rightName) {
        document.title = `${leftName || rightName} - ${DEFAULT_PAGE_TITLE}`;
    } else {
        document.title = DEFAULT_PAGE_TITLE;
    }
}

function showRestoreHint(message, type) {
    if (!restoreHint) return;
    if (!message) {
        restoreHint.hidden = true;
        restoreHint.textContent = '';
        restoreHint.classList.remove('is-warning', 'is-info');
        return;
    }
    restoreHint.hidden = false;
    restoreHint.textContent = message;
    restoreHint.classList.remove('is-warning', 'is-info');
    if (type === 'warning') {
        restoreHint.classList.add('is-warning');
    } else if (type === 'info') {
        restoreHint.classList.add('is-info');
    }
}

function updateTopBackButtons(isResultVisible) {
    if (backToToolboxBtn) {
        backToToolboxBtn.classList.toggle('is-hidden', !!isResultVisible);
    }
}

function normalizeBuffer(value) {
    if (value instanceof ArrayBuffer) return value;
    if (ArrayBuffer.isView(value)) {
        return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
    }
    return null;
}

function parseWorkbookBuffer(arrayBuffer) {
    const normalized = normalizeBuffer(arrayBuffer);
    if (!normalized) throw new Error('Invalid workbook buffer');
    const data = new Uint8Array(normalized);
    const workbook = XLSX.read(data, { type: 'array' });
    const sheets = {};
    workbook.SheetNames.forEach((name) => {
        sheets[name] = XLSX.utils.sheet_to_json(workbook.Sheets[name], {
            header: 1,
            defval: '',
            raw: false
        });
    });
    return sheets;
}

function applySlotSuccess(slotKey, sheets, meta, buffer) {
    const slot = uploadSlotState[slotKey];
    clearParseTimer(slotKey);
    slot.status = 'success';
    slot.progress = 100;
    slot.message = '';
    slot.fileName = meta.name || slot.fileName || '';
    const normalizedBuffer = normalizeBuffer(buffer);
    slot.fileSize = Number.isFinite(meta.size) ? meta.size : (normalizedBuffer ? normalizedBuffer.byteLength : 0);
    slot.type = meta.type || '';
    slot.lastModified = Number.isFinite(meta.lastModified) ? meta.lastModified : 0;
    slot.buffer = normalizedBuffer;

    if (slotKey === 'left') file1Data = sheets;
    else file2Data = sheets;
    renderUploadSlot(slotKey);
}

function isIndexedDbSupported() {
    return typeof indexedDB !== 'undefined';
}

function openCacheDb() {
    return new Promise((resolve, reject) => {
        if (!isIndexedDbSupported()) {
            reject(new Error('IndexedDB unavailable'));
            return;
        }
        const request = indexedDB.open(CACHE_DB_NAME, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(CACHE_STORE_NAME)) {
                db.createObjectStore(CACHE_STORE_NAME, { keyPath: 'key' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Open cache db failed'));
    });
}

async function runCacheRequest(mode, action) {
    const db = await openCacheDb();
    return new Promise((resolve, reject) => {
        let request = null;
        let settled = false;
        const finishResolve = (val) => {
            if (!settled) {
                settled = true;
                resolve(val);
            }
        };
        const finishReject = (err) => {
            if (!settled) {
                settled = true;
                reject(err);
            }
        };
        try {
            const tx = db.transaction(CACHE_STORE_NAME, mode);
            const store = tx.objectStore(CACHE_STORE_NAME);
            request = action(store);
            request.onsuccess = () => finishResolve(request.result);
            request.onerror = () => finishReject(request.error || new Error('Cache request failed'));
            tx.onerror = () => finishReject(tx.error || new Error('Cache transaction failed'));
            tx.onabort = () => finishReject(tx.error || new Error('Cache transaction aborted'));
            tx.oncomplete = () => db.close();
        } catch (err) {
            db.close();
            finishReject(err);
        }
    });
}

async function clearLatestCompareCache() {
    if (!isIndexedDbSupported()) return;
    await runCacheRequest('readwrite', (store) => store.delete(CACHE_KEY));
}

async function saveLatestCompareCache(payload) {
    if (!isIndexedDbSupported()) return false;
    const leftBytes = payload.left && payload.left.buffer ? payload.left.buffer.byteLength : 0;
    const rightBytes = payload.right && payload.right.buffer ? payload.right.buffer.byteLength : 0;
    const totalBytes = leftBytes + rightBytes;
    if (leftBytes > MAX_SINGLE_CACHE_BYTES || rightBytes > MAX_SINGLE_CACHE_BYTES || totalBytes > MAX_TOTAL_CACHE_BYTES) {
        await clearLatestCompareCache();
        showRestoreHint('当前文件较大（超过本地缓存阈值），本次不参与自动恢复。', 'warning');
        return false;
    }
    await runCacheRequest('readwrite', (store) => store.put(payload));
    return true;
}

async function restoreLatestCompareCache() {
    if (!isIndexedDbSupported()) return false;
    let cache = null;
    try {
        cache = await runCacheRequest('readonly', (store) => store.get(CACHE_KEY));
    } catch (err) {
        console.warn('Read cache failed:', err);
        return false;
    }
    if (!cache || !cache.left || !cache.right || !cache.left.buffer || !cache.right.buffer) {
        return false;
    }

    try {
        const leftBuffer = normalizeBuffer(cache.left.buffer);
        const rightBuffer = normalizeBuffer(cache.right.buffer);
        if (!leftBuffer || !rightBuffer) {
            throw new Error('Cached buffer is invalid');
        }
        const leftSheets = parseWorkbookBuffer(leftBuffer);
        const rightSheets = parseWorkbookBuffer(rightBuffer);
        sheetConfigs = (cache.sheetConfigs && typeof cache.sheetConfigs === 'object') ? cache.sheetConfigs : {};

        applySlotSuccess('left', leftSheets, cache.left, leftBuffer);
        applySlotSuccess('right', rightSheets, cache.right, rightBuffer);
        checkReady();

        const timeText = formatDateTime(cache.updatedAt);
        const leftName = cache.left.name || '旧文件';
        const rightName = cache.right.name || '新文件';
        showRestoreHint(`已恢复上次文档：${leftName} / ${rightName}${timeText ? `（${timeText}）` : ''}，可直接开始对比。`, 'info');
        return true;
    } catch (err) {
        console.warn('Restore cache failed:', err);
        try {
            await clearLatestCompareCache();
        } catch (clearErr) {
            console.warn('Clear broken cache failed:', clearErr);
        }
        showRestoreHint('上次缓存恢复失败，已自动清理，请重新上传文件。', 'warning');
        return false;
    }
}

async function saveLatestCompareCacheFromState() {
    const left = uploadSlotState.left;
    const right = uploadSlotState.right;
    if (!left.buffer || !right.buffer) return false;
    const payload = {
        key: CACHE_KEY,
        updatedAt: Date.now(),
        left: {
            name: left.fileName,
            size: left.fileSize,
            type: left.type,
            lastModified: left.lastModified,
            buffer: left.buffer
        },
        right: {
            name: right.fileName,
            size: right.fileSize,
            type: right.type,
            lastModified: right.lastModified,
            buffer: right.buffer
        },
        sheetConfigs: JSON.parse(JSON.stringify(sheetConfigs || {}))
    };
    return saveLatestCompareCache(payload);
}

function scheduleCacheSave(delay) {
    if (cacheSaveTimer) {
        clearTimeout(cacheSaveTimer);
        cacheSaveTimer = null;
    }
    cacheSaveTimer = setTimeout(() => {
        saveLatestCompareCacheFromState().catch((err) => {
            console.warn('Save cache failed:', err);
        });
    }, Number.isFinite(delay) ? delay : 250);
}

function showUploadUI(options) {
    const keepLoadedState = !options || options.keepLoadedState !== false;
    const exitFullscreenBtnEl = document.getElementById('exit-fullscreen-btn');
    if (isFullscreen && exitFullscreenBtnEl) {
        exitFullscreenBtnEl.click();
    } else {
        document.body.classList.remove('fullscreen-mode');
        floatingNav.style.display = 'none';
        const fullscreenBtnEl = document.getElementById('fullscreen-btn');
        const fsControlsEl = document.getElementById('fs-controls');
        if (fullscreenBtnEl) fullscreenBtnEl.style.display = 'flex';
        if (fsControlsEl) fsControlsEl.style.display = 'none';
    }

    uploadSection.classList.remove('collapsed');
    resultSection.style.display = 'none';
    updateTopBackButtons(false);

    if (!keepLoadedState) {
        file1Data = null;
        file2Data = null;
        commonSheets = [];
        currentSheetIndex = 0;
        sheetConfigs = {};
        ['left', 'right'].forEach((slotKey) => {
            const slot = uploadSlotState[slotKey];
            clearParseTimer(slotKey);
            slot.status = 'idle';
            slot.progress = 0;
            slot.fileName = '';
            slot.fileSize = 0;
            slot.type = '';
            slot.lastModified = 0;
            slot.buffer = null;
            slot.message = '';
            renderUploadSlot(slotKey);
        });
    }
    checkReady();
}

function clearParseTimer(slotKey) {
    const slot = uploadSlotState[slotKey];
    if (slot.parseTimer) {
        clearInterval(slot.parseTimer);
        slot.parseTimer = null;
    }
}

function startParsingVisual(slotKey) {
    const slot = uploadSlotState[slotKey];
    clearParseTimer(slotKey);
    slot.status = 'parsing';
    slot.progress = Math.max(slot.progress, 65);
    renderUploadSlot(slotKey);

    slot.parseTimer = setInterval(() => {
        const state = uploadSlotState[slotKey];
        if (state.status !== 'parsing') {
            clearParseTimer(slotKey);
            return;
        }
        if (state.progress < 95) {
            state.progress = Math.min(95, state.progress + 2);
            renderUploadSlot(slotKey);
        }
    }, 100);
}

function renderUploadSlot(slotKey) {
    const slot = uploadSlotState[slotKey];
    const refs = uploadSlotRefs[slotKey];
    if (!refs || !refs.dropZone) return;

    const progress = clampProgress(slot.progress);
    const zone = refs.dropZone;
    zone.classList.remove('is-idle', 'is-reading', 'is-parsing', 'is-success', 'is-error');
    zone.classList.add('is-' + slot.status);

    let statusText = '未上传';
    if (slot.status === 'reading') statusText = '上传中';
    else if (slot.status === 'parsing') statusText = '解析中';
    else if (slot.status === 'success') statusText = '上传成功';
    else if (slot.status === 'error') statusText = slot.message || '上传失败，可重试';

    refs.statusEl.textContent = statusText;
    refs.statusEl.classList.toggle('is-success', slot.status === 'success');
    refs.statusEl.classList.toggle('is-error', slot.status === 'error');

    refs.percentEl.textContent = progress + '%';
    refs.progressBarEl.style.width = progress + '%';
    refs.progressBarEl.classList.toggle('is-parsing', slot.status === 'parsing');
    refs.progressBarEl.classList.toggle('is-success', slot.status === 'success');
    refs.progressBarEl.classList.toggle('is-error', slot.status === 'error');

    if (slot.status === 'success' && slot.fileName) {
        refs.fileNameEl.textContent = `${slot.fileName} (${formatFileSize(slot.fileSize)})`;
    } else if (slot.fileName) {
        refs.fileNameEl.textContent = slot.fileName;
    } else {
        refs.fileNameEl.textContent = '';
    }
    updateFileIdentityUI();
}

// --- 1. 文件上传逻辑 ---

function handleFile(file, isFirst) {
    if (!file) return;
    if (typeof XLSX === 'undefined' || !XLSX || typeof XLSX.read !== 'function') {
        alert('Excel 解析库尚未就绪，请稍后再试。如果持续失败，请刷新页面。');
        return;
    }

    const slotKey = isFirst ? 'left' : 'right';
    const slot = uploadSlotState[slotKey];
    const currentTaskId = ++slot.taskId;

    clearParseTimer(slotKey);
    slot.status = 'reading';
    slot.progress = 0;
    slot.fileName = file.name || '';
    slot.fileSize = file.size || 0;
    slot.type = file.type || '';
    slot.lastModified = file.lastModified || 0;
    slot.buffer = null;
    slot.message = '';
    showRestoreHint('');
    renderUploadSlot(slotKey);

    if (isFirst) file1Data = null;
    else file2Data = null;
    checkReady();

    const isStaleTask = () => uploadSlotState[slotKey].taskId !== currentTaskId;
    const failSlot = (message) => {
        if (isStaleTask()) return;
        clearParseTimer(slotKey);
        if (isFirst) file1Data = null;
        else file2Data = null;
        slot.status = 'error';
        slot.progress = Math.max(8, Math.min(100, slot.progress));
        slot.message = message;
        renderUploadSlot(slotKey);
        checkReady();
    };

    const reader = new FileReader();
    reader.onloadstart = () => {
        if (isStaleTask()) return;
        slot.status = 'reading';
        slot.progress = Math.max(2, slot.progress);
        renderUploadSlot(slotKey);
    };

    reader.onprogress = (e) => {
        if (isStaleTask()) return;
        if (e.lengthComputable && e.total > 0) {
            slot.progress = Math.max(slot.progress, Math.min(70, (e.loaded / e.total) * 70));
        } else {
            slot.progress = Math.min(70, slot.progress + 2);
        }
        renderUploadSlot(slotKey);
    };

    reader.onerror = () => failSlot('上传失败，请重试');
    reader.onabort = () => failSlot('上传已取消，请重新上传');

    reader.onload = (e) => {
        if (isStaleTask()) return;
        startParsingVisual(slotKey);

        setTimeout(() => {
            if (isStaleTask()) return;
            try {
                const arrayBuffer = e.target.result;
                const sheets = parseWorkbookBuffer(arrayBuffer);
                applySlotSuccess(slotKey, sheets, {
                    name: file.name,
                    size: file.size,
                    type: file.type,
                    lastModified: file.lastModified
                }, arrayBuffer);
            } catch (err) {
                console.error('Excel parse error:', err);
                failSlot('解析失败，请检查文件格式');
                return;
            }

            const ready = checkReady();
            if (ready) {
                scheduleCacheSave(150);
            }
        }, 0);
    };

    reader.readAsArrayBuffer(file);
}

function checkReady() {
    const ready = uploadSlotState.left.status === 'success' && uploadSlotState.right.status === 'success';
    startBtn.disabled = !ready;
    return ready;
}

// 绑定拖拽事件
[drop1, drop2].forEach((el, index) => {
    el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('dragover'); });
    el.addEventListener('dragleave', (e) => { e.preventDefault(); el.classList.remove('dragover'); });
    el.addEventListener('drop', (e) => {
        e.preventDefault();
        el.classList.remove('dragover');
        if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0], index === 0);
    });
    // 点击触发 input
    el.addEventListener('click', () => {
        const input = index === 0 ? input1 : input2;
        input.value = '';
        input.click();
    });
});

input1.addEventListener('change', (e) => {
    handleFile(e.target.files[0], true);
    e.target.value = '';
});

input2.addEventListener('change', (e) => {
    handleFile(e.target.files[0], false);
    e.target.value = '';
});

if (backToUploadBtn) {
    backToUploadBtn.addEventListener('click', () => {
        showUploadUI({ keepLoadedState: true });
    });
}

renderUploadSlot('left');
renderUploadSlot('right');
showUploadUI({ keepLoadedState: true });
restoreLatestCompareCache().catch((err) => {
    console.warn('Initial cache restore failed:', err);
});
// --- 2. 对比初始化逻辑 ---

startBtn.addEventListener('click', () => {
    const sheets1 = Object.keys(file1Data);
    const sheets2 = Object.keys(file2Data);
    
    // 如果没有共同的，取并集展示
    const allSheets = new Set([...sheets1, ...sheets2]);
    commonSheets = Array.from(allSheets);

    if (commonSheets.length === 0) {
        alert('无法识别文件内容，请确认 Excel 文件有效性！');
        return;
    }

    // 直接进入对比界面 (跳过弹窗配置)
    showComparisonUI();
});

// 辅助函数：自动识别表头所在的行索引
// 逻辑：前5行中，非空单元格最多的那一行被认为是表头
function detectHeaderRowIndex(rows) {
    if (!rows || rows.length === 0) return 0;
    
    const limit = Math.min(rows.length, 5);
    let bestIndex = 0;
    let maxNonEmpty = -1;

    for (let i = 0; i < limit; i++) {
        const row = rows[i] || [];
        let nonEmptyCount = 0;
        for (let j = 0; j < row.length; j++) {
            const cell = row[j];
            if (cell !== undefined && cell !== null && String(cell).trim() !== '') {
                nonEmptyCount++;
            }
        }
        // 如果当前行非空单元格更多，更新
        if (nonEmptyCount > maxNonEmpty) {
            maxNonEmpty = nonEmptyCount;
            bestIndex = i;
        }
    }
    return bestIndex;
}

// 移除配置队列相关逻辑，改为按需配置或者自动识别
function autoDetectKeys(sheetName) {
    const rows = (file1Data[sheetName] && file1Data[sheetName].length) ? file1Data[sheetName] : 
                 (file2Data[sheetName] ? file2Data[sheetName] : []);
    
    if (!rows || rows.length < 2) return []; // 只有表头或空，没法检测

    const headerIndex = detectHeaderRowIndex(rows);
    const headers = getHeaders(sheetName, rows) || []; // getHeaders 内部也会更新为使用检测到的行
    
    // 尝试寻找常用的主键名
    const potentialKeys = headers.filter(h => /id|code|编号|主键|工号|序号/i.test(h));
    
    // 验证主键唯一性
    for (const key of potentialKeys) {
        const colIndex = headers.indexOf(key);
        if (colIndex === -1) continue;

        const seen = new Set();
        let hasDuplicate = false;
        let emptyCount = 0;
        
        // 检查前 100 行或者所有行
        const checkLimit = Math.min(rows.length, 500);
        // 从表头下一行开始检查
        for (let i = headerIndex + 1; i < checkLimit; i++) {
            const val = rows[i] ? rows[i][colIndex] : undefined;
            const valStr = (val === undefined || val === null) ? '' : String(val).trim();
            
            if (valStr === '') {
                 emptyCount++;
            } else {
                if (seen.has(valStr)) {
                    hasDuplicate = true;
                    break;
                }
                seen.add(valStr);
            }
        }
        
        // 如果重复值很少且非空值占绝大多数，才认为是有效主键
        // 这里严格一点：只要有重复，就不自动当作主键，以免行塌缩
        if (!hasDuplicate && emptyCount < (checkLimit * 0.2)) {
            return [key];
        }
    }
    
    return []; // 没找到唯一键或都有重复，则返回空，使用行号对比
}

function getHeaders(sheetName, providedRows) {
    // 获取表头，尝试 File1 或 File2
    let rows = providedRows || ((file1Data[sheetName] && file1Data[sheetName].length) ? file1Data[sheetName] : 
               (file2Data[sheetName] ? file2Data[sheetName] : []));
               
    if (!rows || rows.length === 0) return [];
    
    // 简单的 normalize 逻辑，确保拿到最宽的数据作为参考
    // 这里简单取第一行，但为了配合 normalizeHeaders，我们应该保持一致
    // 不过 getHeaders 主要用于 Select Modal，简单只取 row 0 也可以
    // 为了稳妥，用 normalize 的简化版
    
    // 找出最长的一行
    let maxCols = 0;
    // 只检查前20行，避免性能问题
    const limit = Math.min(rows.length, 20);
    for(let i=0; i<limit; i++) {
        if (rows[i] && rows[i].length > maxCols) maxCols = rows[i].length;
    }
    
    // 使用自动识别的表头行
    const headerIdx = detectHeaderRowIndex(rows);
    const headers = [...(rows[headerIdx] || [])];
    for (let i = headers.length; i < maxCols; i++) {
        headers.push(`Column ${i + 1}`);
    }
    
    return headers.map(String);
}

function showKeySelectionModal(sheetName) {
    const headers = getHeaders(sheetName);
    if (headers.length === 0) return;

    modalSheetName.textContent = sheetName;
    keyOptionsContainer.innerHTML = '';
    
    // 当前已选的 keys
    const currentKeys = sheetConfigs[sheetName] ? sheetConfigs[sheetName].keys : [];

    headers.forEach(header => {
        const label = document.createElement('label');
        label.className = 'col-option';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = header;
        
        // 勾选状态：如果已配置过，用配置的；否则看是否匹配常用名
        if (currentKeys.length > 0) {
            checkbox.checked = currentKeys.includes(header);
        } else {
             if (/id|code|编号|主键|工号/i.test(header)) {
                 checkbox.checked = true;
             }
        }

        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(header));
        keyOptionsContainer.appendChild(label);
    });

    modalOverlay.style.display = 'flex';
}

confirmKeyBtn.onclick = () => {
    const sheetName = modalSheetName.textContent;
    const checkboxes = keyOptionsContainer.querySelectorAll('input[type=checkbox]:checked');
    const selectedKeys = Array.from(checkboxes).map(cb => cb.value);
    
    // 更新配置并刷新页面
    sheetConfigs[sheetName] = { keys: selectedKeys };
    modalOverlay.style.display = 'none';
    
    // 重新加载当前 Sheet
    loadSheet(sheetName);
    if (checkReady()) {
        scheduleCacheSave(80);
    }
};


function showComparisonUI() {
    uploadSection.classList.add('collapsed');
    resultSection.style.display = 'flex';
    updateTopBackButtons(true);
    
    renderTabs();
    // 默认加载第一个 Sheet
    loadSheet(commonSheets[0]);
    
    // 初始化浮动导航
    initFloatingNav();
    
    // 异步后台计算所有 Sheet 的差异状态（红绿点）
    computeSheetStatusAsync();
}

// --- 3. 渲染与 Tab 切换 ---

function renderTabs() {
    const navNormal = document.getElementById('normal-sheet-nav');
    const listFloating = document.getElementById('floating-sheet-list');
    
    navNormal.innerHTML = '';
    listFloating.innerHTML = '';

    commonSheets.forEach((sheet, idx) => {
        // 普通 Tab (含状态圆点)
        const tab = document.createElement('div');
        tab.className = `sheet-tab ${idx === 0 ? 'active' : ''}`;
        tab.dataset.sheetIndex = idx;
        
        const nameSpan = document.createElement('span');
        nameSpan.textContent = sheet;
        tab.appendChild(nameSpan);
        
        const dot = document.createElement('span');
        dot.className = 'status-dot';
        dot.dataset.status = 'pending'; // 初始状态：灰色闪烁
        tab.appendChild(dot);
        
        tab.onclick = () => switchSheet(idx);
        navNormal.appendChild(tab);

        // 浮动 List Item (也加状态点)
        const item = document.createElement('div');
        item.className = `nav-item ${idx === 0 ? 'active' : ''}`;
        item.dataset.sheetIndex = idx;
        item.innerHTML = `<span>${sheet}</span><span class="status-dot" data-status="pending" style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#d1d5db;margin-left:6px;"></span>`;
        item.onclick = () => switchSheet(idx);
        listFloating.appendChild(item);
    });
}

function switchSheet(index) {
    if (index < 0 || index >= commonSheets.length) return;
    currentSheetIndex = index;
    const sheetName = commonSheets[index];

    // 更新高亮
    const tabs = document.querySelectorAll('.sheet-tab');
    const navItems = document.querySelectorAll('.nav-item');
    tabs.forEach((el, i) => el.classList.toggle('active', i === index));
    navItems.forEach((el, i) => el.classList.toggle('active', i === index));

    // 自动滚动：将当前 Tab 滚动到导航栏可视区域的中间位置
    if (tabs[index]) {
        tabs[index].scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }

    loadSheet(sheetName);
}

// --- 4. 核心对比算法与表格渲染 ---

function loadSheet(sheetName) {
    const containerLeft = document.getElementById('table-container-left');
    const containerRight = document.getElementById('table-container-right');
    
    containerLeft.innerHTML = '计算中...';
    containerRight.innerHTML = '计算中...';

    // 延时为了让 UI 即使响应
    setTimeout(() => {
        try {
            const result = performDiff(sheetName);
            
            containerLeft.innerHTML = renderTableHTML(result.headers1, result.rows1, result.diffs1, 'left', result.colMeta);
            containerRight.innerHTML = renderTableHTML(result.headers2, result.rows2, result.diffs2, 'right', result.colMeta);
            
            // 启用列宽拖拽调整
            enableColumnResizing();

            // 重新绑定滚动同步
            syncScroll();
        } catch (e) {
            console.error("Diff Error:", e);
            containerLeft.innerHTML = `<div style="color:red;padding:20px;">对比出错: ${e.message}</div>`;
            containerRight.innerHTML = `<div style="color:red;padding:20px;">请检查控制台获取详细信息</div>`;
        }
    }, 50);
}

// 移除 syncRowHeights，因为现在是单行固定高度，不再需要同步内容高度
function enableColumnResizing() {
    const tableLeft = document.querySelector('#table-container-left table');
    const tableRight = document.querySelector('#table-container-right table');
    
    if (!tableLeft || !tableRight) return;

    const headersLeft = tableLeft.querySelectorAll('th');
    const headersRight = tableRight.querySelectorAll('th');
    
    // 为每个 Header 添加 Resizer
    [headersLeft, headersRight].forEach((headers, tableIndex) => {
        headers.forEach((th, colIndex) => {
            const resizer = document.createElement('div');
            resizer.classList.add('resizer');
            th.appendChild(resizer);
            
            createResizableColumn(th, resizer, colIndex);
        });
    });

    function createResizableColumn(th, resizer, colIndex) {
        let startX = 0;
        let startWidth = 0;

        const onMouseDown = (e) => {
            startX = e.pageX;
            startWidth = th.offsetWidth;
            
            resizer.classList.add('resizing');
            
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            e.stopPropagation(); // 防止触发排序或其他点击事件
        };

        const onMouseMove = (e) => {
            const diffX = e.pageX - startX;
            const newWidth = Math.max(50, startWidth + diffX); // 最小宽度 50px
            
            // 同步调整两张表的同一列
            updateColumnWidth(colIndex, newWidth);
        };

        const onMouseUp = () => {
            resizer.classList.remove('resizing');
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        resizer.addEventListener('mousedown', onMouseDown);
    }

    function updateColumnWidth(colIndex, width) {
        // 设置 Header 宽度
        if (headersLeft[colIndex]) headersLeft[colIndex].style.width = `${width}px`;
        if (headersRight[colIndex]) headersRight[colIndex].style.width = `${width}px`;
        
        // 设置 min-width 和 max-width 强制生效
        const setStyle = (el) => {
            if (el) {
                el.style.minWidth = `${width}px`;
                el.style.maxWidth = `${width}px`;
                el.style.width = `${width}px`;
            }
        };

        setStyle(headersLeft[colIndex]);
        setStyle(headersRight[colIndex]);
        
        // 注意：由于 table-layout: auto，设置 th 宽度通常足以控制整列。
        // 为了防止 td 内容撑开，td 已经设置了 text-overflow: ellipsis 和 overflow: hidden
    }
}

// 占位函数，避免 resize 事件报错
function syncRowHeights() {
   // No-op
}

function performDiff(sheetName) {
    const rows1 = file1Data[sheetName] || [];
    const rows2 = file2Data[sheetName] || [];
    
    // 逻辑变更：如果当前 sheet 没有配置 config，尝试自动识别
    if (!sheetConfigs[sheetName]) {
        const detectedKeys = autoDetectKeys(sheetName);
        sheetConfigs[sheetName] = { keys: detectedKeys };
        if (checkReady()) {
            scheduleCacheSave(120);
        }
    }
    
    const keys = sheetConfigs[sheetName].keys;
    
    // 更新 UI 提示
    const infoSpan = document.getElementById('current-key-info');
    if (infoSpan) {
        if (keys.length > 0) {
            infoSpan.textContent = `(当前主键: ${keys.join(', ')})`;
        } else {
            infoSpan.textContent = `(当前对比模式: 行号对比)`;
        }
    }

    // 强力清洗字符串：去除首尾空格、去除所有不可见字符(零宽空格等)、去除控制字符
    const cleanHeader = (s) => {
        if (s === undefined || s === null) return "";
        let str = String(s);
        // 1. 替换常见空白为普通空格
        str = str.replace(/[\t\n\r\f\v]/g, " ");
        // 2. 移除特定不可见字符 (如 Zero Width Space \u200B)
        // \s 包含了 \u200B 吗？通常不。手动移除
        str = str.replace(/[\u200B-\u200D\uFEFF\x00-\x1F\x7F-\x9F]/g, "");
        // 3. trim
        return str.trim();
    };

    const normalizeHeaders = (rows) => {
        if (!rows || !rows.length) return [];
        
        // 获取第一行作为基础表头
        let headerIdx = detectHeaderRowIndex(rows);
        if (headerIdx < 0) headerIdx = 0;

        let headers = [...(rows[headerIdx] || [])];
        
        // 深度清洗表头
        headers = headers.map(h => cleanHeader(h));
        
        // --- 性能优化：快速计算最大有效列索引 ---
        // 修正逻辑：用 cleanHeader 后的值判断是否有效
        
        // 1. 先看表头自己的最大有效列
        let maxHeaderIndex = -1;
        for (let c = headers.length - 1; c >= 0; c--) {
             if (headers[c] && headers[c] !== "") {
                 maxHeaderIndex = c;
                 break;
             }
        }
        
        // --- 性能优化：快速计算最大有效列索引 ---
        // 为了避免几十万次循环检查，我们采用采样+倒序截断策略
        
        let maxDataColIndex = -1;
        // 如果行数太多，只检查前100行和后100行，以及中间随机采样
        // 只要发现某列有数据，就认为这一列有效
        
        // 快速扫描：倒序扫描列。只要发现任何一行在这一列有值，就 break，认定这列有效。
        // 列的搜索范围：从 headers.length (或 rows 的最大长度) 开始往下减
        
        // 寻找最长的行长度作为搜索边界
        let scanMaxCol = headers.length; 
        // 简单采样一些行来看最大长度，而不是 scan 所有行
        // 但为了准确，我们至少得知道大致范围。
        // 如果文件实在太大（>5000行），我们限制最大检查列数不超过表头+50，或者不超过 100
        // 防止 Excel 16000列空数据的情况
        
        const SAMPLE_LIMIT = 2000;
        const scanRows = (rows.length > SAMPLE_LIMIT) 
            ? [...rows.slice(0, 500), ...rows.slice(-500)] 
            : rows;

        // 找出这些行里最大的 length
        scanRows.forEach(r => { 
            if(r && r.length > scanMaxCol) scanMaxCol = r.length; 
        });

        // 限制最大列数，防止极端的幽灵数据 (比如限制最多 100 列，或者是有效表头的2倍)
        // 这是一个权衡。如果有真实数据在第 1000 列，会被截断？
        // 暂不强制截断，而是通过快速 trim 解决
        
        // 倒序检查每一列
        for (let c = scanMaxCol - 1; c >= 0; c--) {
            // 如果这一列已经比 maxDataColIndex 小，且比 maxHeaderIndex 小，其实没必要精确找了？
            // 不，我们要找的是“最大的有效列索引”
            
            // 检查这一列在 scanRows 里是否有值
            let hasData = false;
            for(let r=0; r < scanRows.length; r++) {
                const val = scanRows[r] ? scanRows[r][c] : null;
                if (val !== undefined && val !== null && String(val).trim() !== "") {
                    hasData = true;
                    break;
                }
            }
            
            if (hasData) {
                maxDataColIndex = c;
                break; // 找到了最右边的有效数据列，更左边的不用管了
            }
        }
        
        const finalColCount = Math.max(maxDataColIndex, maxHeaderIndex) + 1;
        
            // 截断或补齐
        if (headers.length > finalColCount) {
             headers = headers.slice(0, finalColCount);
        } else {
            // 只有当 finalColCount 大于当前 headers 长度时才补齐
            for (let i = headers.length; i < finalColCount; i++) {
                headers.push(`列 ${i + 1}`); 
            }
        }
        
        // 最终清理：如果还有 "" 空表头，给它命名
        // 同时处理重复表头 (必须在截断之后做，否则会重命名后面会被截断的列)
        const finalHeaderCounts = {};
        
        headers = headers.map((h, i) => {
            let name = (h === "") ? `Column ${i+1}` : h;
            
            if (finalHeaderCounts[name]) {
                finalHeaderCounts[name]++;
                return `${name}_${finalHeaderCounts[name]}`;
            }
            finalHeaderCounts[name] = 1;
            return name;
        });
        
        return headers;
    };

    const rawHeaders1 = normalizeHeaders(rows1);
    const rawHeaders2 = normalizeHeaders(rows2);
    
    // 统一表头 (Union)
    const unionHeaders = [...rawHeaders1];
    rawHeaders2.forEach(h => { if (!unionHeaders.includes(h)) unionHeaders.push(h); });

    const headers1 = unionHeaders;
    const headers2 = unionHeaders;
    
    // 生成列元数据，用于渲染列差异
    const colMeta = unionHeaders.map((h, i) => {
        const in1 = rawHeaders1.includes(h);
        const in2 = rawHeaders2.includes(h);
        return { name: h, index: i, in1, in2 };
    });

    // 辅助：重映射行数据到统一表头（预计算索引映射，避免热循环中 indexOf）
    const buildRemapIndex = (originalHeaders) => {
        const map = new Map();
        originalHeaders.forEach((h, i) => map.set(h, i));
        return unionHeaders.map(h => map.has(h) ? map.get(h) : -1);
    };
    const remapIdx1 = buildRemapIndex(rawHeaders1);
    const remapIdx2 = buildRemapIndex(rawHeaders2);
    
    const remap = (row, remapIndex) => {
        if (!row) return null;
        return remapIndex.map(idx => (idx !== -1) ? row[idx] : null);
    };
    
    // 如果没有Keys，简单行号对比
    if (keys.length === 0) {
        // 简单补齐空行逻辑
        const maxLen = Math.max(rows1.length, rows2.length);
        const aligned1 = [], aligned2 = [];
        const diffs1 = [], diffs2 = []; 
        
        for (let i = 0; i < maxLen; i++) {
            const rawR1 = rows1[i];
            const rawR2 = rows2[i];
            
            const r1 = remap(rawR1, remapIdx1);
            const r2 = remap(rawR2, remapIdx2);

            // 简单处理：全行标记
            aligned1.push(r1 || []);
            aligned2.push(r2 || []);
            
            const d1 = {}, d2 = {};
            if (!rawR1 && rawR2) { 
                 // 右边有，左边无 -> 结构性新增
                 d1._rowType = 'struct-missing';
                 d2._rowType = 'struct-added';
            } else if (rawR1 && !rawR2) { 
                 // 左边有，右边无 -> 结构性删除
                 d1._rowType = 'struct-added';
                 d2._rowType = 'struct-missing';
            } else {
                 // 逐格对比
                 const maxColCount = Math.max(headers1.length, headers2.length);
                 
                 for(let colIdx = 0; colIdx < maxColCount; colIdx++) {
                     let val1 = r1[colIdx];
                     let val2 = r2[colIdx];
                     
                     const v1Str = (val1 === undefined || val1 === null) ? '' : String(val1).trim();
                     const v2Str = (val2 === undefined || val2 === null) ? '' : String(val2).trim();
                     
                     if (v1Str !== v2Str) {
                         d1[colIdx] = 'modified';
                         d2[colIdx] = 'modified';
                     }
                 }
                 
                 const isModified = Object.values(d1).includes('modified');
                 if (!isModified) {
                     d1._rowType = 'match';
                     d2._rowType = 'match';
                 }
            }
            diffs1.push(d1); diffs2.push(d2);
        }
        
        return { headers1, rows1: aligned1, diffs1, headers2, rows2: aligned2, diffs2, colMeta }; 
    }

    const getKey = (row, headers) => {
        return keys.map(k => {
            // 注意：keys 里的值是经过 cleanHeader 的 (因为它们来自 normalized headers)
            // 但 row 是原始数据。我们需要知道 keys 对应在 rawHeaders 中的哪个 index。
            // 此时 headers 参数应该是 rawHeaders (已清洗)。
            const idx = headers.indexOf(k);
            if (idx !== -1) return String(row[idx]).trim();
            return '';
        }).join('||');
    };

    // 构建 Map (使用标准化后的表头来查找 Key)
    // 之前是 rawHeaders1，现在也是归一化过的，所以可以正常匹配
    const map1 = new Map();
    const headerIdx1 = detectHeaderRowIndex(rows1);
    
    if (rows1 && rows1.length > 0) {
        for (let i = headerIdx1 + 1; i < rows1.length; i++) {
             if (!rows1[i]) continue;
            map1.set(getKey(rows1[i], rawHeaders1), rows1[i]);
        }
    }
    
    const map2 = new Map();
    const headerIdx2 = detectHeaderRowIndex(rows2);
    if (rows2 && rows2.length > 0) {
        for (let i = headerIdx2 + 1; i < rows2.length; i++) {
            if (!rows2[i]) continue;
            map2.set(getKey(rows2[i], rawHeaders2), rows2[i]);
        }
    }
    // colMeta 已在上方统一生成

    // 获取所有唯一的 Key (并集)
    const allKeys = new Set([...map1.keys(), ...map2.keys()]);
    
    // ... (rest of logic)

    const alignedRows1 = [headers1]; // 保留表头 (Unified)
    const alignedRows2 = [headers2];
    const diffs1 = [{}]; 
    const diffs2 = [{}];

    allKeys.forEach(key => {
        const rawR1 = map1.get(key);
        const rawR2 = map2.get(key);
        
        const r1 = remap(rawR1, remapIdx1);
        const r2 = remap(rawR2, remapIdx2);

        const d1 = {}, d2 = {};

        if (!rawR1 && rawR2) {
            // 新增 (左边 structural missing, 右边 structural added)
             d1._rowType = 'struct-missing';  
             d2._rowType = 'struct-added';       
             alignedRows1.push(null);     
             alignedRows2.push(r2);
        } else if (rawR1 && !rawR2) {
            // 删除 (左边 structural added/deleted?, 右边 structural missing)
             d1._rowType = 'struct-added'; // Viewed from Old perspective, it exists. 
             // Actually: Old file has it. New file missing it.
             // User wants: "New table missing a line -> Mark in Original Table with SAME COLOR"
             // So, the "Structural Color" applies to the row that EXISTS.
             d1._rowType = 'struct-added'; // Or 'struct-present'
             d2._rowType = 'struct-missing';
             alignedRows1.push(r1);
             alignedRows2.push(null);
        } else {
            // 修改 (详细对比)
            alignedRows1.push(r1);
            alignedRows2.push(r2);
            
            // 对比每一列
            for(let i=0; i<unionHeaders.length; i++) {
                // 列结构差异无需在此处理，render时会根据 colMeta 处理
                if (!colMeta[i].in1 || !colMeta[i].in2) continue;

                let val1 = r1 ? r1[i] : null;
                let val2 = r2 ? r2[i] : null;

                const v1Str = (val1 === undefined || val1 === null) ? '' : String(val1).trim();
                const v2Str = (val2 === undefined || val2 === null) ? '' : String(val2).trim();

                if (v1Str !== v2Str) {
                    d1[i] = 'modified';
                    d2[i] = 'modified';
                }
            }
            
            const isModified1 = Object.values(d1).includes('modified');
            const isModified2 = Object.values(d2).includes('modified');
            if (!isModified1 && !isModified2) {
                 d1._rowType = 'match';
                 d2._rowType = 'match';
            }
        }

        diffs1.push(d1);
        diffs2.push(d2);
    });

    return { 
        headers1, rows1: alignedRows1, diffs1, 
        headers2, rows2: alignedRows2, diffs2,
        colMeta // Pass colMeta
    };
}

function renderTableHTML(headers, rows, diffs, side, colMeta) {
    if (!rows || rows.length === 0) return '<div style="padding:20px;text-align:center;">此文件无数据</div>';
    
    // 预计算列的结构类（避免每行每列重复判断）
    const colStructClass = [];
    const isLeft = (side === 'left');
    if (colMeta) {
        for (let c = 0; c < headers.length; c++) {
            const meta = colMeta[c];
            const existsHere = isLeft ? meta.in1 : meta.in2;
            const existsOther = isLeft ? meta.in2 : meta.in1;
            if (!existsHere) colStructClass[c] = 'col-struct-missing';
            else if (!existsOther) colStructClass[c] = 'col-struct-added';
            else colStructClass[c] = '';
        }
    } else {
        for (let c = 0; c < headers.length; c++) colStructClass[c] = '';
    }
    
    // 用数组 push + join，比字符串 += 快很多
    const buf = [];
    buf.push('<table><thead><tr><th style="width:40px">#</th>');
    for (let c = 0; c < headers.length; c++) {
        const cls = colStructClass[c];
        buf.push(cls ? `<th class="${cls}">${headers[c]}</th>` : `<th>${headers[c]}</th>`);
    }
    buf.push('</tr></thead><tbody>');

    // 行类型 -> CSS 类的映射表
    const rowTypeMap = {
        'struct-added': 'diff-struct-added',
        'struct-missing': 'diff-struct-missing',
        'added': 'diff-added',
        'deleted': 'diff-deleted',
        'match': 'row-match'
    };

    const colCount = headers.length;
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const diff = diffs[i] || {};
        const trClass = rowTypeMap[diff._rowType] || '';

        buf.push(trClass ? `<tr class="${trClass}">` : '<tr>');
        
        if (diff._rowType === 'struct-missing' || diff._rowType === 'placeholder') {
            buf.push('<td></td>');
            for (let c = 0; c < colCount; c++) {
                const cls = colStructClass[c];
                buf.push(cls === 'col-struct-missing' ? `<td class="${cls}"></td>` : '<td></td>');
            }
        } else {
            buf.push(`<td>${i}</td>`);
            for (let c = 0; c < colCount; c++) {
                const val = row ? (row[c] !== undefined && row[c] !== null ? row[c] : '') : '';
                let cls = colStructClass[c];
                if (!cls && diff[c] === 'modified') cls = 'diff-modified';
                
                const safeVal = String(val).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                buf.push(cls 
                    ? `<td class="${cls}" title="${safeVal}">${safeVal}</td>` 
                    : `<td title="${safeVal}">${safeVal}</td>`);
            }
        }
        buf.push('</tr>');
    }
    buf.push('</tbody></table>');
    return buf.join('');
}

// --- 5. 同步滚动 ---

function syncScroll() {
    // 修正：需要监听实际产生滚动的容器 (table-container)，而不是外层的 wrapper
    const d1 = document.getElementById('table-container-left');
    const d2 = document.getElementById('table-container-right');
    if (!d1 || !d2) return;

    let isSyncingLeft = false;
    let isSyncingRight = false;

    d1.onscroll = function() {
        if (!isSyncingLeft) {
            isSyncingRight = true;
            d2.scrollTop = this.scrollTop;
            d2.scrollLeft = this.scrollLeft;
        }
        isSyncingLeft = false;
    };

    d2.onscroll = function() {
        if (!isSyncingRight) {
            isSyncingLeft = true;
            d1.scrollTop = this.scrollTop;
            d1.scrollLeft = this.scrollLeft;
        }
        isSyncingRight = false;
    };
}

// --- 6. 全屏与布局 ---

const fullscreenBtn = document.getElementById('fullscreen-btn');
const exitFullBtn = document.getElementById('exit-fullscreen-btn');
const layoutBtn = document.getElementById('layout-toggle-btn');
const fsControls = document.getElementById('fs-controls');

fullscreenBtn.onclick = () => {
    document.body.classList.add('fullscreen-mode');
    document.documentElement.requestFullscreen(); // 尝试原生全屏
    isFullscreen = true;
    fullscreenBtn.style.display = 'none';
    fsControls.style.display = 'flex';
    floatingNav.style.display = 'flex'; // 显示浮动导航
    initFloatingNav(); // 确保位置正确
};

exitFullBtn.onclick = () => {
    document.body.classList.remove('fullscreen-mode');
    if (document.fullscreenElement) document.exitFullscreen();
    isFullscreen = false;
    fullscreenBtn.style.display = 'flex';
    fsControls.style.display = 'none';
    floatingNav.style.display = 'none';
};

layoutBtn.onclick = () => {
    const view = document.getElementById('comparison-view');
    isLayoutLR = !isLayoutLR;
    if (isLayoutLR) {
        view.className = 'layout-lr';
        layoutBtn.textContent = '📖 切换布局 (上下)';
    } else {
        view.className = 'layout-tb';
        layoutBtn.textContent = '📖 切换布局 (左右)';
    }
};

// --- 7. 浮动导航交互 (拖拽、最小化) ---

const navHandle = document.getElementById('nav-drag-handle');
const navMinimizeBtn = document.getElementById('nav-minimize-btn');

let isDragging = false;
let startX, startY, startLeft, startBottom;

function initFloatingNav() {
    // 默认位置
    floatingNav.style.left = '20px';
    floatingNav.style.bottom = '20px';
}

navHandle.onmousedown = (e) => {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = floatingNav.getBoundingClientRect();
    startLeft = rect.left;
    startBottom = parseInt(window.getComputedStyle(floatingNav).bottom);
    
    document.onmousemove = onDrag;
    document.onmouseup = stopDrag;
};

function onDrag(e) {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    
    // 这里使用 bottom 定位，所以 dy 负值是向上
    // 但 left 是 top-based? 不，CSS里 bottom: 20px, left: 20px
    // 我们更新 left 和 bottom
    
    const newLeft = startLeft + dx;
    const newBottom = startBottom - dy; // clientY 增加是向下，所以 dy 是正数时，bottom 应该减小
    
    floatingNav.style.left = `${newLeft}px`;
    floatingNav.style.bottom = `${newBottom}px`;
}

function stopDrag() {
    isDragging = false;
    document.onmousemove = null;
    document.onmouseup = null;
}

// 窗口大小改变时重新同步行高
window.addEventListener('resize', () => {
    if (window.resizeTimeout) clearTimeout(window.resizeTimeout);
    window.resizeTimeout = setTimeout(() => {
        syncRowHeights();
    }, 100);
});

function stopDrag() {
    isDragging = false;
    document.onmousemove = null;
    document.onmouseup = null;
}

navMinimizeBtn.onclick = (e) => {
    e.stopPropagation(); // 防止触发 mousedown
    floatingNav.classList.toggle('minimized');
    if (floatingNav.classList.contains('minimized')) {
        navMinimizeBtn.textContent = '+';
    } else {
        navMinimizeBtn.textContent = '_';
    }
};

// 点击最小化后的圆球，恢复
floatingNav.onclick = (e) => {
    if (floatingNav.classList.contains('minimized')) {
        floatingNav.classList.remove('minimized');
        navMinimizeBtn.textContent = '_';
    }
};

// 导航按钮
document.getElementById('nav-prev').onclick = () => switchSheet(currentSheetIndex - 1);
document.getElementById('nav-next').onclick = () => switchSheet(currentSheetIndex + 1);
document.getElementById('nav-exit').onclick = () => exitFullBtn.click(); // 退出全屏

// --- 异步后台计算 Sheet 差异状态（红绿点） ---

// 快速对比：只判断两个 Sheet 是否完全一致，不生成完整 diff 结果
// 一旦发现任何差异，立刻返回 false（短路优化）
function isSheetIdentical(sheetName) {
    const rows1 = file1Data[sheetName];
    const rows2 = file2Data[sheetName];
    
    // 一个有一个没有 -> 不同
    if (!rows1 || !rows2) return false;
    if (rows1.length !== rows2.length) return false;
    
    // 逐行逐格快速对比
    for (let i = 0; i < rows1.length; i++) {
        const r1 = rows1[i];
        const r2 = rows2[i];
        
        if (!r1 && !r2) continue;
        if (!r1 || !r2) return false;
        
        // 列数不同 -> 但要考虑尾部空列，所以取较长的
        const maxCol = Math.max(r1.length, r2.length);
        for (let c = 0; c < maxCol; c++) {
            const v1 = (r1[c] === undefined || r1[c] === null) ? '' : String(r1[c]).trim();
            const v2 = (r2[c] === undefined || r2[c] === null) ? '' : String(r2[c]).trim();
            if (v1 !== v2) return false; // 短路：发现第一处不同就 return
        }
    }
    return true;
}

// 更新某个 Sheet 的状态圆点
function updateSheetDot(sheetIndex, status) {
    // 更新普通导航栏
    const tabs = document.querySelectorAll('.sheet-tab');
    if (tabs[sheetIndex]) {
        const dot = tabs[sheetIndex].querySelector('.status-dot');
        if (dot) dot.dataset.status = status;
    }
    // 更新浮动导航
    const navItems = document.querySelectorAll('.nav-item');
    if (navItems[sheetIndex]) {
        const dot = navItems[sheetIndex].querySelector('.status-dot');
        if (dot) {
            dot.dataset.status = status;
            // 浮动导航中的圆点需要内联样式更新颜色
            if (status === 'same') {
                dot.style.background = '#22c55e';
                dot.style.boxShadow = '0 0 4px rgba(34, 197, 94, 0.5)';
            } else if (status === 'diff') {
                dot.style.background = '#ef4444';
                dot.style.boxShadow = '0 0 4px rgba(239, 68, 68, 0.5)';
            }
        }
    }
}

// 异步逐个计算所有 Sheet 的状态
function computeSheetStatusAsync() {
    let idx = 0;
    
    function processNext() {
        if (idx >= commonSheets.length) return; // 全部完成
        
        const sheetName = commonSheets[idx];
        const currentIdx = idx;
        idx++;
        
        // 用 setTimeout 让出主线程，避免阻塞 UI
        setTimeout(() => {
            try {
                const same = isSheetIdentical(sheetName);
                updateSheetDot(currentIdx, same ? 'same' : 'diff');
            } catch (e) {
                console.warn(`Sheet "${sheetName}" 状态检测失败:`, e);
                updateSheetDot(currentIdx, 'diff'); // 出错就标红，保守策略
            }
            processNext(); // 处理下一个
        }, 20); // 20ms 间隔，给 UI 喘息
    }
    
    processNext();
}

// 原生全屏事件监听 (ESC 退出时处理)
document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && isFullscreen) {
        exitFullBtn.click();
    }
});
