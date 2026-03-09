// === 本地设置持久化 (localStorage) ===
const STORAGE_KEY = 'json_diff_settings';

const defaultSettings = {
    theme: 'light',
    scheme: 'vscode',
    font: "'Local_JetBrains_Mono', 'JetBrains Mono', Consolas, monospace",
    fontSize: 14,
    tabSize: 4,
    shortcuts: {
        lv1: { ctrl: false, shift: false, alt: true, code: "Digit1", key: "1", displayKey: "1" },
        lv2: { ctrl: false, shift: false, alt: true, code: "Digit2", key: "2", displayKey: "2" },
        unfold: { ctrl: false, shift: false, alt: true, code: "Digit3", key: "3", displayKey: "3" }
    }
};

function shortcutFromString(value) {
    if (typeof value !== 'string') return null;
    const parts = value.split('+').map(s => s.trim()).filter(Boolean);
    if (!parts.length) return null;

    const rawKey = parts[parts.length - 1];
    const modParts = parts.slice(0, -1).map(s => s.toUpperCase());
    const ctrl = modParts.includes('CTRL') || modParts.includes('CMD') || modParts.includes('META');
    const shift = modParts.includes('SHIFT');
    const alt = modParts.includes('ALT') || modParts.includes('OPTION');

    const upperKey = rawKey.toUpperCase();
    let code = '';
    let key = upperKey;
    let displayKey = upperKey;

    if (/^[A-Z]$/.test(upperKey)) {
        code = 'Key' + upperKey;
    } else if (/^[0-9]$/.test(upperKey)) {
        code = 'Digit' + upperKey;
        key = upperKey;
        displayKey = upperKey;
    } else if (upperKey === 'SPACE') {
        code = 'Space';
        key = ' ';
        displayKey = 'SPACE';
    }

    return { ctrl, shift, alt, code, key, displayKey };
}

function normalizeShortcut(def, fallback) {
    if (def === null) return null;
    if (typeof def === 'string') {
        return shortcutFromString(def) || { ...fallback };
    }
    if (!def || typeof def !== 'object') {
        return { ...fallback };
    }

    let key = typeof def.key === 'string' ? def.key.toUpperCase() : '';
    let code = typeof def.code === 'string' ? def.code : '';

    if (!code && /^[A-Z]$/.test(key)) code = 'Key' + key;
    if (!code && /^[0-9]$/.test(key)) code = 'Digit' + key;
    if (!code && key === ' ') code = 'Space';

    if (!key && code.startsWith('Key')) key = code.replace('Key', '');
    if (!key && code.startsWith('Digit')) key = code.replace('Digit', '');
    if (!key && code === 'Space') key = ' ';

    const displayKey = (typeof def.displayKey === 'string' && def.displayKey) ? def.displayKey : (key === ' ' ? 'SPACE' : key);
    if (!code && !key) return { ...fallback };

    return {
        ctrl: !!def.ctrl,
        shift: !!def.shift,
        alt: !!def.alt,
        code,
        key,
        displayKey
    };
}

let userSettings = {
    ...defaultSettings,
    shortcuts: { ...defaultSettings.shortcuts }
};
try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        const parsed = JSON.parse(saved);
        const savedShortcuts = (parsed && typeof parsed.shortcuts === 'object' && parsed.shortcuts !== null) ? parsed.shortcuts : {};
        userSettings = {
            ...defaultSettings,
            ...parsed,
            shortcuts: {
                ...defaultSettings.shortcuts,
                ...savedShortcuts
            }
        };
    }
} catch(e) {}

userSettings.shortcuts = {
    lv1: normalizeShortcut(userSettings.shortcuts.lv1, defaultSettings.shortcuts.lv1),
    lv2: normalizeShortcut(userSettings.shortcuts.lv2, defaultSettings.shortcuts.lv2),
    unfold: normalizeShortcut(userSettings.shortcuts.unfold, defaultSettings.shortcuts.unfold)
};

function saveSettings() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userSettings));
}

// === CodeMirror 初始实例 ===
let currentTabSize = userSettings.tabSize;
let shortcuts = userSettings.shortcuts;

const cmOptions = {
    mode: "application/json",
    lineNumbers: true,
    foldGutter: true,
    gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
    matchBrackets: true,
    tabSize: currentTabSize
};

const editorLeft = CodeMirror.fromTextArea(document.getElementById("json-input-left"), cmOptions);
const editorRight = CodeMirror.fromTextArea(document.getElementById("json-input-right"), cmOptions);

// === 设置逻辑与主题切换 ===
const htmlEl = document.documentElement;
const themeToggleBtn = document.getElementById('theme-toggle');
const schemeSelect = document.getElementById('scheme-select');
const fontSelect = document.getElementById('font-select');
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings');

// 初始化应用设置
function applySettings() {
    htmlEl.setAttribute('data-theme', userSettings.theme);
    htmlEl.setAttribute('data-scheme', userSettings.scheme);
    
    if (schemeSelect) schemeSelect.value = userSettings.scheme;
    if (fontSelect) fontSelect.value = userSettings.font;
    
    document.querySelectorAll('.CodeMirror').forEach(el => {
        el.style.fontFamily = userSettings.font;
        el.style.fontSize = userSettings.fontSize + 'px';
    });
}
applySettings();

themeToggleBtn.addEventListener('click', () => {
    const isDark = htmlEl.getAttribute('data-theme') === 'dark';
    const newTheme = isDark ? 'light' : 'dark';
    htmlEl.setAttribute('data-theme', newTheme);
    userSettings.theme = newTheme;
    saveSettings();
});

schemeSelect.addEventListener('change', (e) => {
    const newScheme = e.target.value;
    htmlEl.setAttribute('data-scheme', newScheme);
    userSettings.scheme = newScheme;
    saveSettings();
});

fontSelect.addEventListener('change', (e) => {
    const font = e.target.value;
    document.querySelectorAll('.CodeMirror').forEach(el => {
        el.style.fontFamily = font;
    });
    userSettings.font = font;
    saveSettings();
    // 刷新防止行号错位
    editorLeft.refresh();
    editorRight.refresh();
});

settingsBtn.addEventListener('click', () => { settingsModal.style.display = 'flex'; });
closeSettingsBtn.addEventListener('click', () => { settingsModal.style.display = 'none'; });

// Tab 切换逻辑
const tabBtns = document.querySelectorAll('.tab-btn');
const settingsPanes = document.querySelectorAll('.settings-pane');
tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        // 移除所有 active
        tabBtns.forEach(b => b.classList.remove('active'));
        settingsPanes.forEach(p => p.classList.remove('active'));
        
        // 添加当前 active
        btn.classList.add('active');
        const targetId = btn.getAttribute('data-target');
        document.getElementById(targetId).classList.add('active');
    });
});

// 字体大小调整逻辑
const fontSizeSlider = document.getElementById('font-size-slider');
const fontSizeVal = document.getElementById('font-size-val');

if (fontSizeSlider) {
    fontSizeSlider.value = userSettings.fontSize;
    fontSizeVal.textContent = userSettings.fontSize + 'px';
}

fontSizeSlider.addEventListener('input', (e) => {
    const size = e.target.value;
    fontSizeVal.textContent = size + 'px';
    document.querySelectorAll('.CodeMirror').forEach(el => {
        el.style.fontSize = size + 'px';
    });
    userSettings.fontSize = parseInt(size);
    saveSettings();
    editorLeft.refresh();
    editorRight.refresh();
});

// 缩进大小调整逻辑
const tabSizeSlider = document.getElementById('tab-size-slider');
const tabSizeVal = document.getElementById('tab-size-val');

if (tabSizeSlider) {
    tabSizeSlider.value = userSettings.tabSize;
    tabSizeVal.textContent = userSettings.tabSize;
    
    tabSizeSlider.addEventListener('input', (e) => {
        const size = parseInt(e.target.value);
        currentTabSize = size;
        tabSizeVal.textContent = size;
        editorLeft.setOption('tabSize', size);
        editorRight.setOption('tabSize', size);
        
        userSettings.tabSize = size;
        saveSettings();
        
        // 实时重新格式化现有的 JSON 数据
        const silentFormat = (editor) => {
            try {
                const val = editor.getValue();
                if (!val.trim()) return;
                const obj = JSON.parse(val);
                // 使用新的缩进层级重新生成字符串
                editor.setValue(JSON.stringify(obj, null, currentTabSize));
            } catch(err) {
                // 如果当前编辑器里的 JSON 格式不合法，就不强制刷新它，也不弹窗报错打扰用户
            }
        };
        silentFormat(editorLeft);
        silentFormat(editorRight);
    });
}

// 快捷键捕获录入
function bindShortcutInput(inputId, targetObjKey) {
    const input = document.getElementById(inputId);
    
    input.addEventListener('focus', () => {
        input.value = '请按下组合键...';
        input.style.color = '#ef4444'; // 红色提示录入中
    });

    input.addEventListener('blur', () => {
        input.style.color = 'var(--core-blue)';
        const def = shortcuts[targetObjKey];
        if (def) {
            let parts = [];
            if (def.ctrl) parts.push('Ctrl');
            if (def.shift) parts.push('Shift');
            if (def.alt) parts.push('Alt');
            parts.push(def.displayKey || def.key);
            input.value = parts.join('+');
        } else {
            input.value = '';
        }
    });

    input.addEventListener('keydown', (e) => {
        e.preventDefault();
        e.stopPropagation(); // 阻止冒泡
        
        const isCtrl = e.ctrlKey || e.metaKey;
        const isShift = e.shiftKey;
        const isAlt = e.altKey;
        
        // 抓取按键的物理物理编码（忽略大小写和Shift影响）
        const code = e.code || "";
        const key = e.key.toUpperCase();
        
        if (key === 'ESCAPE') {
            // 仅仅取消录入状态，不修改原快捷键，不冒泡触发关闭窗口
            input.blur();
            return;
        }

        if (key === 'BACKSPACE' || key === 'DELETE') {
            shortcuts[targetObjKey] = null;
            userSettings.shortcuts[targetObjKey] = null;
            saveSettings();
            input.blur();
            return;
        }
        
        let displayStr = [];
        if (isCtrl) displayStr.push('Ctrl');
        if (isShift) displayStr.push('Shift');
        if (isAlt) displayStr.push('Alt');
        
        // 如果只是按下了修饰键（还没按实体键）
        const isModifier = ['ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'].includes(code) || ['CONTROL', 'SHIFT', 'ALT', 'META'].includes(key);
        if (isModifier) {
            input.value = displayStr.join('+') + '+...';
            return;
        }
        
        // 格式化按键的显示名
        let displayKey = key;
        if (code.startsWith('Key')) displayKey = code.replace('Key', '');
        else if (code.startsWith('Digit')) displayKey = code.replace('Digit', '');
        else if (key === ' ') displayKey = 'SPACE';

        displayStr.push(displayKey);
        
        // 保存按键的组合状态、code(用来匹配物理按键)和用于显示的displayKey
        const newShortcut = { ctrl: isCtrl, shift: isShift, alt: isAlt, code: code, key: key, displayKey: displayKey };
        shortcuts[targetObjKey] = newShortcut;
        userSettings.shortcuts[targetObjKey] = newShortcut;
        saveSettings();
        
        input.value = displayStr.join('+');
        input.blur();
    });
    
    // 初始化时，如果已有值则触发一次blur来回显
    if (input) input.dispatchEvent(new Event('blur'));
}
bindShortcutInput('shortcut-lv1', 'lv1');
bindShortcutInput('shortcut-lv2', 'lv2');
bindShortcutInput('shortcut-unfold', 'unfold');

// 全局快捷键拦截器 (使用 capture 捕获阶段，防止被 CodeMirror 内部吞掉)
window.addEventListener('keydown', (e) => {
    // 1. 统一的 Escape 键退出逻辑
    if (e.key === 'Escape') {
        const modals = document.querySelectorAll('.modal-overlay');
        let closedAny = false;
        modals.forEach(m => {
            if (window.getComputedStyle(m).display !== 'none') {
                m.style.display = 'none';
                closedAny = true;
            }
        });
        if (closedAny) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
    }

    // 只有当焦点在设置面板的“输入框”里（正在录制按键）时，才不触发功能
    if (e.target.tagName === 'INPUT' && e.target.closest('#settings-modal')) return;

    const checkShortcut = (def) => {
        if (!def) return false;
        
        const eventCode = (e.code || '');
        const eventKey = (e.key || '').toUpperCase();
        const defCode = (def.code || '');
        const defKey = (def.key || '').toUpperCase();
        
        const defKeyFromCode = defCode.replace(/^Digit/, '').replace(/^Numpad/, '').replace(/^Key/, '').toUpperCase();
        const eventKeyFromCode = eventCode.replace(/^Digit/, '').replace(/^Numpad/, '').replace(/^Key/, '').toUpperCase();

        // 匹配逻辑：优先用 Code 物理按键匹配，其次用 Key 字符匹配
        const codeMatch = !!(defCode && eventCode && eventCode === defCode);
        const keyMatch = !!(
            (defKey && eventKey === defKey) ||
            (defKey && eventKeyFromCode === defKey) ||
            (defKeyFromCode && eventKey === defKeyFromCode)
        );
        const isMatchKey = codeMatch || keyMatch;

        const ctrlMatch = (e.ctrlKey || e.metaKey) === !!def.ctrl;
        const shiftMatch = e.shiftKey === !!def.shift;
        const altMatch = e.altKey === !!def.alt;

        return ctrlMatch && shiftMatch && altMatch && isMatchKey;
    };
    
    if (checkShortcut(shortcuts.lv1)) {
        e.preventDefault(); 
        e.stopPropagation();
        foldToLevel(editorLeft, 1); foldToLevel(editorRight, 1);
        if (isDiffMode) setTimeout(updateDiffBadges, 50);
    } else if (checkShortcut(shortcuts.lv2)) {
        e.preventDefault(); 
        e.stopPropagation();
        foldToLevel(editorLeft, 2); foldToLevel(editorRight, 2);
        if (isDiffMode) setTimeout(updateDiffBadges, 50);
    } else if (checkShortcut(shortcuts.unfold)) {
        e.preventDefault();
        e.stopPropagation();
        unfoldAll(editorLeft); unfoldAll(editorRight);
        if (isDiffMode) setTimeout(updateDiffBadges, 50);
    }
}, true); // <- 关键点：设置为 true，在捕获阶段拦截事件

// 自定义纯括号匹配的 fold range finder（不依赖 JSON tokenizer，Diff 模式下也可用）
function diffBracketFold(cm, start) {
    var line = cm.getLine(start.line);
    if (!line) return null;

    function sanitize(s) {
        return s.replace(/\\./g, '__').replace(/"(?:[^"\\]|\\.)*"/g, function(m) {
            return '"' + '_'.repeat(Math.max(0, m.length - 2)) + '"';
        });
    }

    var clean = sanitize(line);
    var openCh = -1, openBracket = null;
    for (var j = 0; j < clean.length; j++) {
        if (clean[j] === '{' || clean[j] === '[') { openCh = j; openBracket = clean[j]; break; }
    }
    if (openCh < 0) return null;

    var closeBracket = openBracket === '{' ? '}' : ']';
    var depth = 1;

    for (var k = openCh + 1; k < clean.length; k++) {
        if (clean[k] === openBracket) depth++;
        else if (clean[k] === closeBracket) { depth--; if (depth === 0) return null; }
    }

    for (var i = start.line + 1; i <= cm.lastLine(); i++) {
        var cl = sanitize(cm.getLine(i) || '');
        for (var c = 0; c < cl.length; c++) {
            if (cl[c] === openBracket) depth++;
            else if (cl[c] === closeBracket) {
                depth--;
                if (depth === 0) {
                    return { from: CodeMirror.Pos(start.line, openCh + 1), to: CodeMirror.Pos(i, c) };
                }
            }
        }
    }
    return null;
}

function unfoldAll(cm) {
    if (!cm) return;
    suppressSync = true;
    cm.operation(function() {
        for (var i = cm.firstLine(); i <= cm.lastLine(); i++) {
            cm.foldCode(CodeMirror.Pos(i, 0), null, "unfold");
        }
    });
    suppressSync = false;
}

// 层级折叠辅助 (重构版：内→外顺序折叠，确保展开外层时内层折叠仍然保持)
function foldToLevel(cm, level) {
    if (!cm) return;

    suppressSync = true;
    cm.operation(function() {
        // Step 1: 先全部展开
        for (var i = cm.firstLine(); i <= cm.lastLine(); i++) {
            cm.foldCode(CodeMirror.Pos(i, 0), null, "unfold");
        }

        // Step 2: 计算每一行的真实结构深度
        var depths = [];
        var currentDepth = 0;
        for (var i = cm.firstLine(); i <= cm.lastLine(); i++) {
            depths[i] = currentDepth;
            var lineText = cm.getLine(i) || '';
            var cleanText = lineText.replace(/\\./g, '__').replace(/"(?:[^"\\]|\\.)*"/g, '""');
            for (var ci = 0; ci < cleanText.length; ci++) {
                var ch = cleanText[ci];
                if (ch === '{' || ch === '[') currentDepth++;
                else if (ch === '}' || ch === ']') currentDepth--;
            }
        }

        // Step 3: 收集所有在目标深度(含更深)的可折叠行
        var foldable = [];
        for (var i = cm.firstLine(); i <= cm.lastLine(); i++) {
            if (depths[i] >= level) {
                var lt = cm.getLine(i) || '';
                var ct = lt.replace(/\\./g, '__').replace(/"(?:[^"\\]|\\.)*"/g, '""');
                for (var ci = 0; ci < ct.length; ci++) {
                    if (ct[ci] === '{' || ct[ci] === '[') {
                        foldable.push({ line: i, depth: depths[i] });
                        break;
                    }
                }
            }
        }

        // Step 4: 按深度从深到浅排序后折叠（内→外），确保嵌套折叠被保留
        foldable.sort(function(a, b) { return b.depth - a.depth; });
        var rf = isDiffMode ? diffBracketFold : null;
        for (var fi = 0; fi < foldable.length; fi++) {
            cm.foldCode(CodeMirror.Pos(foldable[fi].line, 0), rf, "fold");
        }
    });
    suppressSync = false;
}

// === 工具栏按钮功能实现 ===

// 格式化功能
function formatJSON(editor) {
    try {
        const val = editor.getValue();
        if (!val.trim()) return;
        const obj = JSON.parse(val);
        editor.setValue(JSON.stringify(obj, null, currentTabSize));
    } catch (e) {
        alert('格式化失败，请检查 JSON 语法是否正确\n' + e.message);
    }
}

// 复制功能
function copyContent(editor) {
    const val = editor.getValue();
    navigator.clipboard.writeText(val).then(() => {
        const btn = document.activeElement;
        const originalTitle = btn.title || '复制';
        btn.title = '稍等，复制成功!';
        setTimeout(() => btn.title = originalTitle, 2000);
    }).catch(() => {
        alert('复制失败，请尝试手动复制');
    });
}

// 绑定左侧面板按钮
document.getElementById('clear-left').addEventListener('click', () => editorLeft.setValue(''));
document.getElementById('format-left').addEventListener('click', () => formatJSON(editorLeft));
document.getElementById('copy-left').addEventListener('click', () => copyContent(editorLeft));
document.getElementById('search-left').addEventListener('click', () => editorLeft.execCommand('find'));

// 绑定右侧面板按钮
document.getElementById('clear-right').addEventListener('click', () => editorRight.setValue(''));
document.getElementById('format-right').addEventListener('click', () => formatJSON(editorRight));
document.getElementById('copy-right').addEventListener('click', () => copyContent(editorRight));
document.getElementById('search-right').addEventListener('click', () => editorRight.execCommand('find'));

// ==================== JSON 深度结构化对比引擎 ====================

let isDiffMode = false;
let diffSyncCleanup = null;
let diffTextMarks = [];
let diffBookmarks = [];
let suppressSync = false;

// --- 预处理：递归排序键名 (A-Z字典序, Rule 4) ---
function sortObjectKeys(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(sortObjectKeys);
    const sorted = {};
    Object.keys(obj).sort((a, b) => a.localeCompare(b)).forEach(key => {
        sorted[key] = sortObjectKeys(obj[key]);
    });
    return sorted;
}

// --- 核心：深度结构化对比算法 ---
function deepCompare(oldVal, newVal) {
    if (oldVal === undefined && newVal === undefined) return { status: 'unchanged' };
    if (oldVal === undefined) return { status: 'added', newValue: newVal };
    if (newVal === undefined) return { status: 'removed', oldValue: oldVal };

    if (oldVal === null && newVal === null) return { status: 'unchanged' };
    if (oldVal === null || newVal === null) return { status: 'modified', oldValue: oldVal, newValue: newVal };

    // 强类型敏感 (Rule 5): typeof 不同即为修改
    const oldIsArr = Array.isArray(oldVal);
    const newIsArr = Array.isArray(newVal);
    if (typeof oldVal !== typeof newVal || oldIsArr !== newIsArr) {
        return { status: 'modified', oldValue: oldVal, newValue: newVal };
    }

    if (oldIsArr) return deepCompareArrays(oldVal, newVal);
    if (typeof oldVal === 'object') return deepCompareObjects(oldVal, newVal);

    // 原始值严格相等
    if (oldVal === newVal) return { status: 'unchanged' };
    return { status: 'modified', oldValue: oldVal, newValue: newVal };
}

function deepCompareObjects(oldObj, newObj) {
    const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
    const sortedKeys = [...allKeys].sort((a, b) => a.localeCompare(b));
    const children = {};
    let hasChanges = false;

    for (const key of sortedKeys) {
        const inOld = key in oldObj;
        const inNew = key in newObj;
        if (!inOld) {
            children[key] = { status: 'added', newValue: newObj[key] };
            hasChanges = true;
        } else if (!inNew) {
            children[key] = { status: 'removed', oldValue: oldObj[key] };
            hasChanges = true;
        } else {
            children[key] = deepCompare(oldObj[key], newObj[key]);
            if (children[key].status !== 'unchanged') hasChanges = true;
        }
    }
    return { type: 'object', status: hasChanges ? 'modified' : 'unchanged', children };
}

function deepCompareArrays(oldArr, newArr) {
    const maxLen = Math.max(oldArr.length, newArr.length);
    const children = [];
    let hasChanges = false;

    for (let i = 0; i < maxLen; i++) {
        if (i >= oldArr.length) {
            children.push({ status: 'added', newValue: newArr[i] });
            hasChanges = true;
        } else if (i >= newArr.length) {
            children.push({ status: 'removed', oldValue: oldArr[i] });
            hasChanges = true;
        } else {
            const child = deepCompare(oldArr[i], newArr[i]);
            children.push(child);
            if (child.status !== 'unchanged') hasChanges = true;
        }
    }
    return { type: 'array', status: hasChanges ? 'modified' : 'unchanged', children };
}

// --- 字符级差异：查找行内首尾公共区间，锁定中间差异段 ---
function computeInlineCharDiff(oldLine, newLine) {
    let prefixLen = 0;
    const minLen = Math.min(oldLine.length, newLine.length);
    while (prefixLen < minLen && oldLine[prefixLen] === newLine[prefixLen]) prefixLen++;

    let suffixLen = 0;
    while (suffixLen < (minLen - prefixLen) &&
           oldLine[oldLine.length - 1 - suffixLen] === newLine[newLine.length - 1 - suffixLen]) suffixLen++;

    return {
        left:  { from: prefixLen, to: oldLine.length  - suffixLen },
        right: { from: prefixLen, to: newLine.length - suffixLen }
    };
}

// --- 对齐渲染器：根据 Diff 树同步生成左右两侧行文本 + 行注解 ---
function generateAlignedDiff(oldSorted, newSorted, diffTree, tabSize) {
    const leftLines = [], rightLines = [], leftAnno = [], rightAnno = [];
    const charDiffs = {};

    const ind = (d) => ' '.repeat(d * tabSize);

    function push(lt, rt, la, ra) {
        const idx = leftLines.length;
        leftLines.push(lt);
        rightLines.push(rt);
        leftAnno.push(la);
        rightAnno.push(ra);
        return idx;
    }

    // 将任意 JSON 值（已排序）展平为带缩进的多行文本
    function valueToLines(val, depth, keyStr, isLast) {
        const comma = isLast ? '' : ',';
        const prefix = keyStr !== null ? (ind(depth) + JSON.stringify(keyStr) + ': ') : ind(depth);

        if (val === null || typeof val !== 'object') {
            return [prefix + JSON.stringify(val) + comma];
        }

        const isArr = Array.isArray(val);
        const open = isArr ? '[' : '{';
        const close = isArr ? ']' : '}';

        if ((isArr && val.length === 0) || (!isArr && Object.keys(val).length === 0)) {
            return [prefix + open + close + comma];
        }

        const lines = [prefix + open];
        if (isArr) {
            val.forEach((item, i) => {
                lines.push(...valueToLines(item, depth + 1, null, i === val.length - 1));
            });
        } else {
            const keys = Object.keys(val);
            keys.forEach((k, i) => {
                lines.push(...valueToLines(val[k], depth + 1, k, i === keys.length - 1));
            });
        }
        lines.push(ind(depth) + close + comma);
        return lines;
    }

    // 核心递归：同步遍历 Diff 树，生成左右对齐行
    function walkValue(diff, oldVal, newVal, depth, keyStr, isLast) {
        const comma = isLast ? '' : ',';
        const prefix = keyStr !== null ? (ind(depth) + JSON.stringify(keyStr) + ': ') : ind(depth);

        // ---- 完全一致 ----
        if (diff.status === 'unchanged') {
            valueToLines(oldVal, depth, keyStr, isLast).forEach(l => push(l, l, 'unchanged', 'unchanged'));
            return;
        }

        // ---- 新增：左侧垫空、右侧绿底 ----
        if (diff.status === 'added') {
            valueToLines(newVal, depth, keyStr, isLast).forEach(l => push('', l, 'spacer', 'added'));
            return;
        }

        // ---- 删除：左侧红底、右侧垫空 ----
        if (diff.status === 'removed') {
            valueToLines(oldVal, depth, keyStr, isLast).forEach(l => push(l, '', 'removed', 'spacer'));
            return;
        }

        // ---- 修改（容器：Object） ----
        if (diff.type === 'object') {
            push(prefix + '{', prefix + '{', 'unchanged', 'unchanged');
            const childKeys = Object.keys(diff.children);
            childKeys.forEach((k, idx) => {
                const isLastChild = idx === childKeys.length - 1;
                const childDiff = diff.children[k];
                walkValue(childDiff, oldVal ? oldVal[k] : undefined, newVal ? newVal[k] : undefined, depth + 1, k, isLastChild);
            });
            push(ind(depth) + '}' + comma, ind(depth) + '}' + comma, 'unchanged', 'unchanged');
            return;
        }

        // ---- 修改（容器：Array） ----
        if (diff.type === 'array') {
            push(prefix + '[', prefix + '[', 'unchanged', 'unchanged');
            diff.children.forEach((childDiff, idx) => {
                const isLastChild = idx === diff.children.length - 1;
                const oldItem = (oldVal && idx < oldVal.length) ? oldVal[idx] : undefined;
                const newItem = (newVal && idx < newVal.length) ? newVal[idx] : undefined;
                walkValue(childDiff, oldItem, newItem, depth + 1, null, isLastChild);
            });
            push(ind(depth) + ']' + comma, ind(depth) + ']' + comma, 'unchanged', 'unchanged');
            return;
        }

        // ---- 修改（叶子：原始值变化 或 类型变化） ----
        // 当两侧都是单行原始值时，精确到字符级
        const oldIsPrimitive = (oldVal === null || typeof oldVal !== 'object');
        const newIsPrimitive = (newVal === null || typeof newVal !== 'object');

        if (oldIsPrimitive && newIsPrimitive) {
            const oldText = prefix + JSON.stringify(oldVal) + comma;
            const newText = prefix + JSON.stringify(newVal) + comma;
            const lineIdx = push(oldText, newText, 'modified', 'modified');
            charDiffs[lineIdx] = computeInlineCharDiff(oldText, newText);
        } else {
            // 类型变化（如 数字 → 对象）：两侧各自展平，用 spacer 垫齐
            const oldLines = valueToLines(oldVal, depth, keyStr, isLast);
            const newLines = valueToLines(newVal, depth, keyStr, isLast);
            const maxLen = Math.max(oldLines.length, newLines.length);
            for (let i = 0; i < maxLen; i++) {
                push(
                    i < oldLines.length ? oldLines[i] : '',
                    i < newLines.length ? newLines[i] : '',
                    i < oldLines.length ? 'modified' : 'spacer',
                    i < newLines.length ? 'modified' : 'spacer'
                );
            }
        }
    }

    walkValue(diffTree, oldSorted, newSorted, 0, null, true);

    // 后处理：逐侧独立修正逗号（解决因 spacer 导致的尾逗号错乱）
    function fixCommas(lines) {
        for (let i = 0; i < lines.length; i++) {
            const cur = lines[i];
            if (!cur.trim()) continue;
            const trimmed = cur.trim();
            // 跳过开括号行（末尾是 { 或 [）
            if (trimmed.endsWith('{') || trimmed.endsWith('[')) continue;

            // 找到下一个非空行
            let nextTrimmed = '';
            for (let j = i + 1; j < lines.length; j++) {
                if (lines[j].trim()) { nextTrimmed = lines[j].trim(); break; }
            }

            const beforeClose = (nextTrimmed.length > 0 && (nextTrimmed[0] === '}' || nextTrimmed[0] === ']'));
            const needsComma = (nextTrimmed.length > 0 && !beforeClose);
            const hasComma = cur.trimEnd().endsWith(',');

            if (needsComma && !hasComma) {
                lines[i] = cur.trimEnd() + ',';
            } else if (!needsComma && hasComma) {
                const idx = cur.lastIndexOf(',');
                lines[i] = cur.substring(0, idx);
            }
        }
    }
    fixCommas(leftLines);
    fixCommas(rightLines);

    return { leftLines, rightLines, leftAnno, rightAnno, charDiffs };
}

// --- 清除所有 Diff 视觉标记 ---
function clearDiffMarks() {
    diffTextMarks.forEach(m => m.clear());
    diffTextMarks = [];
    diffBookmarks.forEach(b => b.clear());
    diffBookmarks = [];

    [editorLeft, editorRight].forEach(cm => {
        for (let i = 0; i < cm.lineCount(); i++) {
            cm.removeLineClass(i, 'background');
            cm.removeLineClass(i, 'wrap');
            cm.setGutterMarker(i, 'diff-gutter', null);
        }
    });
}

// --- 右侧差异框体：找到连续变更行，加上包围边框 ---
function applyRightBorders(rightAnno) {
    let blockStart = -1;
    const flush = (end) => {
        if (blockStart < 0) return;
        for (let j = blockStart; j <= end; j++) {
            editorRight.addLineClass(j, 'wrap', 'diff-block-side');
            if (j === blockStart) editorRight.addLineClass(j, 'wrap', 'diff-block-top');
            if (j === end) editorRight.addLineClass(j, 'wrap', 'diff-block-bottom');
        }
        blockStart = -1;
    };

    for (let i = 0; i < rightAnno.length; i++) {
        const changed = (rightAnno[i] !== 'unchanged');
        if (changed) { if (blockStart < 0) blockStart = i; }
        else { flush(i - 1); }
    }
    flush(rightAnno.length - 1);
}

// --- 双侧行号 Gutter 标记 ---
function applyGutterMarkers(leftAnno, rightAnno) {
    for (let i = 0; i < rightAnno.length; i++) {
        // 右侧 Gutter
        const rt = rightAnno[i];
        if (rt === 'added' || rt === 'modified') {
            const el = document.createElement('div');
            el.className = 'diff-gutter-dot diff-gutter-' + rt;
            el.textContent = '●';
            editorRight.setGutterMarker(i, 'diff-gutter', el);
        } else if (rt === 'spacer') {
            const el = document.createElement('div');
            el.className = 'diff-gutter-dot diff-gutter-removed';
            el.textContent = '●';
            editorRight.setGutterMarker(i, 'diff-gutter', el);
        }
        // 左侧 Gutter
        const lt = leftAnno[i];
        if (lt === 'removed' || lt === 'modified') {
            const el = document.createElement('div');
            el.className = 'diff-gutter-dot diff-gutter-' + lt;
            el.textContent = '●';
            editorLeft.setGutterMarker(i, 'diff-gutter', el);
        } else if (lt === 'spacer') {
            const el = document.createElement('div');
            el.className = 'diff-gutter-dot diff-gutter-added';
            el.textContent = '●';
            editorLeft.setGutterMarker(i, 'diff-gutter', el);
        }
    }
}

// --- 应用完整 Diff 渲染 ---
function applyDiffToEditors(result) {
    const { leftLines, rightLines, leftAnno, rightAnno, charDiffs } = result;

    clearDiffMarks();

    // 为两侧编辑器统一加入 diff-gutter 列（保持 gutter 宽度一致 → 左右对齐）
    const diffGutters = ['CodeMirror-linenumbers', 'CodeMirror-foldgutter', 'diff-gutter'];
    editorLeft.setOption('gutters', diffGutters);
    editorRight.setOption('gutters', diffGutters);

    editorLeft.setValue(leftLines.join('\n'));
    editorRight.setValue(rightLines.join('\n'));

    // 行级背景色
    for (let i = 0; i < leftAnno.length; i++) {
        if (leftAnno[i] === 'modified') editorLeft.addLineClass(i, 'background', 'diff-line-modified');
        else if (leftAnno[i] === 'removed') editorLeft.addLineClass(i, 'background', 'diff-line-removed');
        else if (leftAnno[i] === 'spacer') editorLeft.addLineClass(i, 'background', 'diff-line-spacer');

        if (rightAnno[i] === 'modified') editorRight.addLineClass(i, 'background', 'diff-line-modified');
        else if (rightAnno[i] === 'added') editorRight.addLineClass(i, 'background', 'diff-line-added');
        else if (rightAnno[i] === 'spacer') editorRight.addLineClass(i, 'background', 'diff-line-spacer');
    }

    // 字符级高亮（仅在右侧加边框，左侧加柔和背景）
    Object.keys(charDiffs).forEach(lineStr => {
        const i = parseInt(lineStr);
        const cd = charDiffs[i];
        if (cd.left.from < cd.left.to) {
            diffTextMarks.push(editorLeft.markText(
                { line: i, ch: cd.left.from }, { line: i, ch: cd.left.to },
                { className: 'diff-char-old' }
            ));
        }
        if (cd.right.from < cd.right.to) {
            diffTextMarks.push(editorRight.markText(
                { line: i, ch: cd.right.from }, { line: i, ch: cd.right.to },
                { className: 'diff-char-new' }
            ));
        }
    });

    // 右侧框体边框
    applyRightBorders(rightAnno);
    // 双侧 Gutter 标记
    applyGutterMarkers(leftAnno, rightAnno);
}

// --- 折叠透视徽章：在右侧折叠行末尾显示差异类型小圆点 ---
function updateDiffBadges() {
    if (!isDiffMode) return;

    diffBookmarks.forEach(b => b.clear());
    diffBookmarks = [];

    const cm = editorRight;
    const rightAnno = window._diffRightAnno;
    const leftAnno = window._diffLeftAnno;
    if (!rightAnno) return;

    for (let i = 0; i < cm.lineCount(); i++) {
        const marks = cm.findMarksAt(CodeMirror.Pos(i, 0));
        const foldMark = marks.find(m => m.__isFold);
        if (!foldMark) continue;

        const range = foldMark.find();
        if (!range) continue;

        const types = new Set();
        for (let j = range.from.line; j <= range.to.line; j++) {
            if (rightAnno[j] === 'added') types.add('added');
            else if (rightAnno[j] === 'modified') types.add('modified');
            else if (rightAnno[j] === 'spacer' && leftAnno[j] === 'removed') types.add('removed');
        }
        if (types.size === 0) continue;

        const badge = document.createElement('span');
        badge.className = 'diff-badge-container';
        for (const t of ['added', 'removed', 'modified']) {
            if (types.has(t)) {
                const dot = document.createElement('span');
                dot.className = 'diff-badge-dot diff-badge-' + t;
                badge.appendChild(dot);
            }
        }

        const lineText = cm.getLine(i) || '';
        const bm = cm.setBookmark(CodeMirror.Pos(i, lineText.length), { widget: badge, insertLeft: true });
        diffBookmarks.push(bm);
    }
}

// --- 双边同步系统（滚动同步 + 折叠镜像 + 徽章更新） ---
function enableDiffSync() {
    if (diffSyncCleanup) diffSyncCleanup();

    let syncing = false;

    const onScrollLeft = () => {
        if (syncing) return; syncing = true;
        const s = editorLeft.getScrollInfo();
        editorRight.scrollTo(s.left, s.top);
        syncing = false;
    };
    const onScrollRight = () => {
        if (syncing) return; syncing = true;
        const s = editorRight.getScrollInfo();
        editorLeft.scrollTo(s.left, s.top);
        syncing = false;
    };

    const onFoldLeft = (cm, from) => {
        if (syncing || suppressSync) return; syncing = true;
        editorRight.foldCode(CodeMirror.Pos(from.line, 0), isDiffMode ? diffBracketFold : null, 'fold');
        setTimeout(updateDiffBadges, 0);
        syncing = false;
    };
    const onUnfoldLeft = (cm, from) => {
        if (syncing || suppressSync) return; syncing = true;
        editorRight.foldCode(CodeMirror.Pos(from.line, 0), null, 'unfold');
        setTimeout(updateDiffBadges, 0);
        syncing = false;
    };
    const onFoldRight = (cm, from) => {
        if (syncing || suppressSync) return; syncing = true;
        editorLeft.foldCode(CodeMirror.Pos(from.line, 0), isDiffMode ? diffBracketFold : null, 'fold');
        setTimeout(updateDiffBadges, 0);
        syncing = false;
    };
    const onUnfoldRight = (cm, from) => {
        if (syncing || suppressSync) return; syncing = true;
        editorLeft.foldCode(CodeMirror.Pos(from.line, 0), null, 'unfold');
        setTimeout(updateDiffBadges, 0);
        syncing = false;
    };

    editorLeft.on('scroll', onScrollLeft);
    editorRight.on('scroll', onScrollRight);
    editorLeft.on('fold', onFoldLeft);
    editorLeft.on('unfold', onUnfoldLeft);
    editorRight.on('fold', onFoldRight);
    editorRight.on('unfold', onUnfoldRight);

    diffSyncCleanup = () => {
        editorLeft.off('scroll', onScrollLeft);
        editorRight.off('scroll', onScrollRight);
        editorLeft.off('fold', onFoldLeft);
        editorLeft.off('unfold', onUnfoldLeft);
        editorRight.off('fold', onFoldRight);
        editorRight.off('unfold', onUnfoldRight);
        diffSyncCleanup = null;
    };
}

// --- 入口：执行比对 ---
function runCompare() {
    const leftText = editorLeft.getValue().trim();
    const rightText = editorRight.getValue().trim();

    if (!leftText || !rightText) {
        alert('请在两侧面板中分别粘贴需要比对的 JSON 数据');
        return;
    }

    let leftObj, rightObj;
    try { leftObj = JSON.parse(leftText); }
    catch (e) { alert('左侧 JSON 解析失败：\n' + e.message); return; }
    try { rightObj = JSON.parse(rightText); }
    catch (e) { alert('右侧 JSON 解析失败：\n' + e.message); return; }

    // 步骤1: 递归键名排序 (Rule 4)
    const oldSorted = sortObjectKeys(leftObj);
    const newSorted = sortObjectKeys(rightObj);

    // 步骤2: 深度结构对比
    const diffTree = deepCompare(oldSorted, newSorted);

    // 步骤3: 生成对齐行输出
    const result = generateAlignedDiff(oldSorted, newSorted, diffTree, currentTabSize);

    // 存储注解供徽章系统读取
    window._diffRightAnno = result.rightAnno;
    window._diffLeftAnno = result.leftAnno;

    // 步骤4: 渲染到编辑器
    isDiffMode = true;
    applyDiffToEditors(result);

    // 步骤5: 切换 fold gutter 为自定义 range finder（Diff 内容不是合法 JSON，原生 brace-fold 依赖 tokenizer 会失效）
    editorLeft.setOption('foldGutter', { rangeFinder: diffBracketFold });
    editorRight.setOption('foldGutter', { rangeFinder: diffBracketFold });

    // 步骤6: 启用双边同步
    enableDiffSync();

    // 步骤7: 折叠到第一级（内→外顺序，确保嵌套折叠被保留）
    foldToLevel(editorLeft, 1);
    foldToLevel(editorRight, 1);

    // 步骤8: 更新折叠透视徽章
    setTimeout(updateDiffBadges, 50);
}

document.getElementById('compare-btn').addEventListener('click', runCompare);

