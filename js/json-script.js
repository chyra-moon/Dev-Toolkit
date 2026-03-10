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
        if (isDiffMode) scheduleBadgeUpdate();
    } else if (checkShortcut(shortcuts.lv2)) {
        e.preventDefault(); 
        e.stopPropagation();
        foldToLevel(editorLeft, 2); foldToLevel(editorRight, 2);
        if (isDiffMode) scheduleBadgeUpdate();
    } else if (checkShortcut(shortcuts.unfold)) {
        e.preventDefault();
        e.stopPropagation();
        unfoldAll(editorLeft); unfoldAll(editorRight);
        if (isDiffMode) scheduleBadgeUpdate();
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

// 格式化功能（带智能容错：解析失败时自动检测问题并提供修复）
// 当前活跃的问题通知条状态（用于清理）
var _activeIssueBar = null;

function dismissIssueBar() {
    if (!_activeIssueBar) return;
    _activeIssueBar.markers.forEach(function(m) { m.clear(); });
    if (_activeIssueBar.barEl && _activeIssueBar.barEl.parentNode) {
        _activeIssueBar.barEl.remove();
    }
    _activeIssueBar = null;
}

function formatJSON(editor, callback) {
    var val = editor.getValue();
    if (!val.trim()) { if (callback) callback(false); return; }

    // 先清除上一次的通知条和标记
    dismissIssueBar();

    var result = tryParse(val);
    if (result.ok) {
        editor.setValue(JSON.stringify(result.val, null, currentTabSize));
        if (callback) callback(true);
        return;
    }

    // 解析失败 → 检测问题
    var issues = detectJsonIssues(val);
    if (issues.fixes.length === 0) {
        alert('格式化失败，请检查 JSON 语法是否正确\n' + result.err);
        if (callback) callback(false);
        return;
    }

    // 区分可自动修复的 vs 仅标记的
    var autoFixable = issues.fixes.filter(function(f) { return !f.manualOnly; });

    // 高亮问题位置
    var markers = [];
    highlightIssues(editor, issues.positions, markers);

    // 构建摘要文本
    var side = (editor === editorLeft) ? '左侧' : '右侧';
    var summary = '【' + side + '】';
    summary += issues.fixes.map(function(f) { return f.name + ' ×' + f.count; }).join('，');

    // 显示浮动通知条
    showIssueBar(editor, summary, autoFixable.length > 0, markers, issues, callback);
}

function showIssueBar(editor, summary, hasAutoFix, markers, issues, callback) {
    // 找到编辑器对应的面板容器
    var cmEl = editor.getWrapperElement();
    var panel = cmEl.closest('.editor-panel');
    if (!panel) panel = cmEl.parentElement;

    // 创建通知条
    var bar = document.createElement('div');
    bar.className = 'issue-bar';

    var textSpan = document.createElement('span');
    textSpan.className = 'issue-bar-text';
    textSpan.textContent = summary;
    bar.appendChild(textSpan);

    var btnGroup = document.createElement('span');
    btnGroup.className = 'issue-bar-btns';

    if (hasAutoFix) {
        var fixBtn = document.createElement('button');
        fixBtn.className = 'issue-bar-fix-btn';
        fixBtn.textContent = '自动修复';
        fixBtn.addEventListener('click', function() {
            // 清除当前标记
            markers.forEach(function(m) { m.clear(); });
            markers.length = 0;

            var fixResult = tryParse(issues.fixed);
            if (!fixResult.ok) {
                // 修复后仍失败 → 回写修复后文本，重新检测剩余问题
                editor.setValue(issues.fixed);
                var remaining = detectJsonIssues(issues.fixed);
                if (remaining.fixes.length > 0) {
                    highlightIssues(editor, remaining.positions, markers);
                    var side = (editor === editorLeft) ? '左侧' : '右侧';
                    textSpan.textContent = '【' + side + '】已修复部分问题，剩余：' +
                        remaining.fixes.map(function(f) { return f.name + ' ×' + f.count; }).join('，');
                    fixBtn.style.display = 'none';
                } else {
                    alert('修复后仍然无法解析，请手动检查');
                    dismissIssueBar();
                }
                if (callback) callback(false);
                return;
            }

            editor.setValue(JSON.stringify(fixResult.val, null, currentTabSize));
            dismissIssueBar();
            if (callback) callback(true);
        });
        btnGroup.appendChild(fixBtn);
    }

    var dismissBtn = document.createElement('button');
    dismissBtn.className = 'issue-bar-dismiss-btn';
    dismissBtn.textContent = '×';
    dismissBtn.title = '关闭';
    dismissBtn.addEventListener('click', function() {
        dismissIssueBar();
        if (callback) callback(false);
    });
    btnGroup.appendChild(dismissBtn);

    bar.appendChild(btnGroup);

    // 插入到面板顶部（toolbar 下方）
    var toolbar = panel.querySelector('.panel-toolbar');
    if (toolbar && toolbar.nextSibling) {
        panel.insertBefore(bar, toolbar.nextSibling);
    } else {
        panel.appendChild(bar);
    }

    _activeIssueBar = { barEl: bar, markers: markers };
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
    // 智能配对：主键检测 → 内容哈希精确消除 → 相似度贪心配对 → 兜底增删
    var pairs = matchArrayElements(oldArr, newArr);
    var children = [];
    var hasChanges = false;

    for (var i = 0; i < pairs.length; i++) {
        var p = pairs[i];
        var child;
        if (p.type === 'unchanged') {
            child = { status: 'unchanged' };
            child._oldVal = p.oldVal;
            child._newVal = p.newVal;
        } else if (p.type === 'added') {
            child = { status: 'added', newValue: p.newVal };
            child._newVal = p.newVal;
            hasChanges = true;
        } else if (p.type === 'removed') {
            child = { status: 'removed', oldValue: p.oldVal };
            child._oldVal = p.oldVal;
            hasChanges = true;
        } else {
            // matched — 递归比较
            child = deepCompare(p.oldVal, p.newVal);
            child._oldVal = p.oldVal;
            child._newVal = p.newVal;
            if (child.status !== 'unchanged') hasChanges = true;
        }
        children.push(child);
    }
    return { type: 'array', status: hasChanges ? 'modified' : 'unchanged', children: children };
}

// --- 数组元素智能配对引擎 ---
function matchArrayElements(oldArr, newArr) {
    var oldLen = oldArr.length, newLen = newArr.length;
    if (oldLen === 0 && newLen === 0) return [];
    if (oldLen === 0) return newArr.map(function(v) { return { type: 'added', newVal: v }; });
    if (newLen === 0) return oldArr.map(function(v) { return { type: 'removed', oldVal: v }; });

    // --- 第1层：主键自动检测（仅全是对象时） ---
    var allOldObj = true, allNewObj = true;
    for (var i = 0; i < oldLen; i++) { if (oldArr[i] === null || typeof oldArr[i] !== 'object' || Array.isArray(oldArr[i])) { allOldObj = false; break; } }
    for (var i = 0; i < newLen; i++) { if (newArr[i] === null || typeof newArr[i] !== 'object' || Array.isArray(newArr[i])) { allNewObj = false; break; } }

    if (allOldObj && allNewObj) {
        var pk = detectPrimaryKey(oldArr, newArr);
        if (pk) return matchByPrimaryKey(oldArr, newArr, pk);
    }

    // --- 第2层：内容哈希精确匹配 + 相似度配对 ---
    return matchByContent(oldArr, newArr);
}

// 检测主键：扫描所有对象的公共字段，找到值全局唯一的字段
function detectPrimaryKey(oldArr, newArr) {
    // 收集候选字段（两侧所有对象都有的字段）
    var candidateKeys = null;
    var all = oldArr.concat(newArr);
    for (var i = 0; i < all.length; i++) {
        var keys = Object.keys(all[i]);
        if (candidateKeys === null) {
            candidateKeys = {};
            for (var j = 0; j < keys.length; j++) candidateKeys[keys[j]] = true;
        } else {
            var next = {};
            for (var j = 0; j < keys.length; j++) {
                if (candidateKeys[keys[j]]) next[keys[j]] = true;
            }
            candidateKeys = next;
        }
        if (Object.keys(candidateKeys).length === 0) return null;
    }

    // 优先级列表：常见主键名优先
    var preferred = ['id', '_id', 'Id', 'ID', 'uuid', 'key', 'code', 'name'];
    var remaining = Object.keys(candidateKeys).filter(function(k) { return preferred.indexOf(k) === -1; });
    var ordered = preferred.filter(function(k) { return candidateKeys[k]; }).concat(remaining);

    // 检查每个候选字段的值是否在各自数组内唯一，且值是原始类型
    for (var ci = 0; ci < ordered.length; ci++) {
        var field = ordered[ci];
        var oldVals = {}, newVals = {};
        var valid = true;

        for (var i = 0; i < oldArr.length; i++) {
            var v = oldArr[i][field];
            if (v === null || typeof v === 'object') { valid = false; break; }
            var sv = String(v);
            if (oldVals[sv]) { valid = false; break; }
            oldVals[sv] = true;
        }
        if (!valid) continue;

        for (var i = 0; i < newArr.length; i++) {
            var v = newArr[i][field];
            if (v === null || typeof v === 'object') { valid = false; break; }
            var sv = String(v);
            if (newVals[sv]) { valid = false; break; }
            newVals[sv] = true;
        }
        if (valid) return field;
    }
    return null;
}

// 按主键配对：以 new 的顺序为基准，deleted 的插在原邻居旁
function matchByPrimaryKey(oldArr, newArr, pk) {
    var oldMap = {};
    for (var i = 0; i < oldArr.length; i++) oldMap[String(oldArr[i][pk])] = { idx: i, val: oldArr[i] };

    var matchedOld = {};
    var result = [];

    // 第一遍：按 new 的顺序遍历，匹配或标记新增
    for (var i = 0; i < newArr.length; i++) {
        var key = String(newArr[i][pk]);
        if (oldMap[key]) {
            var o = oldMap[key];
            matchedOld[o.idx] = true;
            result.push({ type: 'matched', oldVal: o.val, newVal: newArr[i] });
        } else {
            result.push({ type: 'added', newVal: newArr[i] });
        }
    }

    // 第二遍：收集 old 中未匹配的（deleted），插入到结果中合适的位置
    var deleted = [];
    for (var i = 0; i < oldArr.length; i++) {
        if (!matchedOld[i]) deleted.push({ type: 'removed', oldVal: oldArr[i], origIdx: i });
    }

    // 把 deleted 项插回：每个 deleted 插在它原始相邻元素对应位置的前面
    if (deleted.length > 0) {
        // 建立 old 主键 → result 位置的映射
        var keyToResultIdx = {};
        for (var ri = 0; ri < result.length; ri++) {
            if (result[ri].type === 'matched') {
                keyToResultIdx[String(result[ri].oldVal[pk])] = ri;
            }
        }

        for (var di = deleted.length - 1; di >= 0; di--) {
            var d = deleted[di];
            // 找它在 old 中右边最近的已匹配元素
            var insertPos = result.length;
            for (var oi = d.origIdx + 1; oi < oldArr.length; oi++) {
                var nk = String(oldArr[oi][pk]);
                if (keyToResultIdx[nk] !== undefined) {
                    insertPos = keyToResultIdx[nk];
                    break;
                }
            }
            result.splice(insertPos, 0, d);
            // 刷新映射（插入后后面的索引都+1了）
            for (var k in keyToResultIdx) {
                if (keyToResultIdx[k] >= insertPos) keyToResultIdx[k]++;
            }
        }
    }

    return result;
}

// 内容哈希配对：精确消除 → 相似度贪心（适用于混合类型或无主键的数组）
function matchByContent(oldArr, newArr) {
    var oldUsed = new Array(oldArr.length);
    var newUsed = new Array(newArr.length);

    // 缓存 stringify
    var oldStrs = oldArr.map(function(v) { return JSON.stringify(v); });
    var newStrs = newArr.map(function(v) { return JSON.stringify(v); });

    // --- 精确匹配：用 Map 按内容分桶，同内容按出现顺序配对 ---
    var newBuckets = {};
    for (var i = 0; i < newArr.length; i++) {
        var s = newStrs[i];
        if (!newBuckets[s]) newBuckets[s] = [];
        newBuckets[s].push(i);
    }

    var pairs = []; // {oldIdx, newIdx, type}

    for (var i = 0; i < oldArr.length; i++) {
        var s = oldStrs[i];
        if (newBuckets[s] && newBuckets[s].length > 0) {
            var ni = newBuckets[s].shift();
            oldUsed[i] = true;
            newUsed[ni] = true;
            pairs.push({ oldIdx: i, newIdx: ni, type: 'unchanged' });
        }
    }

    // --- 相似度配对：剩余的对象尝试匹配 ---
    var unmatchedOld = [];
    var unmatchedNew = [];
    for (var i = 0; i < oldArr.length; i++) { if (!oldUsed[i]) unmatchedOld.push(i); }
    for (var i = 0; i < newArr.length; i++) { if (!newUsed[i]) unmatchedNew.push(i); }

    if (unmatchedOld.length > 0 && unmatchedNew.length > 0) {
        // 只对两边都是对象的做相似度匹配
        var simCandidates = [];
        for (var oi = 0; oi < unmatchedOld.length; oi++) {
            var oIdx = unmatchedOld[oi];
            var ov = oldArr[oIdx];
            if (ov === null || typeof ov !== 'object') continue;
            for (var ni = 0; ni < unmatchedNew.length; ni++) {
                var nIdx = unmatchedNew[ni];
                if (newUsed[nIdx]) continue;
                var nv = newArr[nIdx];
                if (nv === null || typeof nv !== 'object') continue;
                var sim = objectSimilarity(ov, nv);
                if (sim >= 0.3) simCandidates.push({ oldIdx: oIdx, newIdx: nIdx, sim: sim });
            }
        }

        // 贪心：按相似度降序取不冲突的配对
        simCandidates.sort(function(a, b) { return b.sim - a.sim; });
        for (var i = 0; i < simCandidates.length; i++) {
            var c = simCandidates[i];
            if (oldUsed[c.oldIdx] || newUsed[c.newIdx]) continue;
            oldUsed[c.oldIdx] = true;
            newUsed[c.newIdx] = true;
            pairs.push({ oldIdx: c.oldIdx, newIdx: c.newIdx, type: 'matched' });
        }
    }

    // --- 汇总：以 new 的顺序为基准输出 ---
    // 构建 newIdx → pair 映射
    var newIdxToPair = {};
    for (var i = 0; i < pairs.length; i++) {
        newIdxToPair[pairs[i].newIdx] = pairs[i];
    }

    var result = [];
    var deletedBeforeNew = {}; // oldIdx → 需要插在哪个 newIdx 前面

    // 对未匹配的 old，找它最近的已匹配右邻居，插在对方前面
    var unmatchedOldFinal = [];
    for (var i = 0; i < oldArr.length; i++) { if (!oldUsed[i]) unmatchedOldFinal.push(i); }

    // 构建 oldIdx → newIdx 的位置映射（已配对的）
    var oldToNew = {};
    for (var i = 0; i < pairs.length; i++) {
        if (pairs[i].oldIdx !== undefined) oldToNew[pairs[i].oldIdx] = pairs[i].newIdx;
    }

    for (var di = 0; di < unmatchedOldFinal.length; di++) {
        var oIdx = unmatchedOldFinal[di];
        var insertBefore = newArr.length; // 默认插末尾
        for (var oi = oIdx + 1; oi < oldArr.length; oi++) {
            if (oldToNew[oi] !== undefined) { insertBefore = oldToNew[oi]; break; }
        }
        if (!deletedBeforeNew[insertBefore]) deletedBeforeNew[insertBefore] = [];
        deletedBeforeNew[insertBefore].push(oIdx);
    }

    // 按 new 的顺序输出
    for (var ni = 0; ni < newArr.length; ni++) {
        // 先插入应该在这个位置前面的 deleted
        if (deletedBeforeNew[ni]) {
            for (var d = 0; d < deletedBeforeNew[ni].length; d++) {
                result.push({ type: 'removed', oldVal: oldArr[deletedBeforeNew[ni][d]] });
            }
        }
        var p = newIdxToPair[ni];
        if (p) {
            if (p.type === 'unchanged') {
                result.push({ type: 'unchanged', oldVal: oldArr[p.oldIdx], newVal: newArr[ni] });
            } else {
                result.push({ type: 'matched', oldVal: oldArr[p.oldIdx], newVal: newArr[ni] });
            }
        } else {
            result.push({ type: 'added', newVal: newArr[ni] });
        }
    }
    // 末尾的 deleted
    if (deletedBeforeNew[newArr.length]) {
        for (var d = 0; d < deletedBeforeNew[newArr.length].length; d++) {
            result.push({ type: 'removed', oldVal: oldArr[deletedBeforeNew[newArr.length][d]] });
        }
    }

    return result;
}

// 对象浅层相似度：相同键中值相等的比例
function objectSimilarity(a, b) {
    var isArrA = Array.isArray(a), isArrB = Array.isArray(b);
    if (isArrA !== isArrB) return 0;
    if (isArrA) return JSON.stringify(a) === JSON.stringify(b) ? 1 : 0;

    var keysA = Object.keys(a), keysB = Object.keys(b);
    var allKeys = {};
    for (var i = 0; i < keysA.length; i++) allKeys[keysA[i]] = true;
    for (var i = 0; i < keysB.length; i++) allKeys[keysB[i]] = true;
    var total = Object.keys(allKeys).length;
    if (total === 0) return 1;

    var same = 0;
    for (var k in allKeys) {
        if (k in a && k in b && JSON.stringify(a[k]) === JSON.stringify(b[k])) same++;
    }
    return same / total;
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
                // 智能配对后 child 自带 _oldVal/_newVal，不再按索引取
                const oldItem = childDiff._oldVal;
                const newItem = childDiff._newVal;
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
        cm.operation(function() {
            for (var i = 0; i < cm.lineCount(); i++) {
                cm.removeLineClass(i, 'background');
                cm.removeLineClass(i, 'wrap');
                cm.setGutterMarker(i, 'diff-gutter', null);
            }
        });
    });
}

// --- 右侧差异框体：找到连续变更行，加上包围边框 ---
function applyRightBorders(rightAnno) {
    editorRight.operation(function() {
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
    });
}

// --- 双侧行号 Gutter 标记 ---
function applyGutterMarkers(leftAnno, rightAnno) {
    editorLeft.operation(function() {
        editorRight.operation(function() {
            for (var i = 0; i < rightAnno.length; i++) {
                // 右侧 Gutter
                var rt = rightAnno[i];
                if (rt === 'added' || rt === 'modified') {
                    var el = document.createElement('div');
                    el.className = 'diff-gutter-dot diff-gutter-' + rt;
                    el.textContent = '●';
                    editorRight.setGutterMarker(i, 'diff-gutter', el);
                } else if (rt === 'spacer') {
                    var el = document.createElement('div');
                    el.className = 'diff-gutter-dot diff-gutter-removed';
                    el.textContent = '●';
                    editorRight.setGutterMarker(i, 'diff-gutter', el);
                }
                // 左侧 Gutter
                var lt = leftAnno[i];
                if (lt === 'removed' || lt === 'modified') {
                    var el2 = document.createElement('div');
                    el2.className = 'diff-gutter-dot diff-gutter-' + lt;
                    el2.textContent = '●';
                    editorLeft.setGutterMarker(i, 'diff-gutter', el2);
                } else if (lt === 'spacer') {
                    var el2 = document.createElement('div');
                    el2.className = 'diff-gutter-dot diff-gutter-added';
                    el2.textContent = '●';
                    editorLeft.setGutterMarker(i, 'diff-gutter', el2);
                }
            }
        });
    });
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

    // 批量应用行级背景色 + 字符级高亮（包在 operation 中避免逐行触发 DOM 重绘）
    editorLeft.operation(function() {
        for (var i = 0; i < leftAnno.length; i++) {
            if (leftAnno[i] === 'modified') editorLeft.addLineClass(i, 'background', 'diff-line-modified');
            else if (leftAnno[i] === 'removed') editorLeft.addLineClass(i, 'background', 'diff-line-removed');
            else if (leftAnno[i] === 'spacer') editorLeft.addLineClass(i, 'background', 'diff-line-spacer');
        }
        var charKeys = Object.keys(charDiffs);
        for (var ci = 0; ci < charKeys.length; ci++) {
            var idx = parseInt(charKeys[ci]);
            var cd = charDiffs[idx];
            if (cd.left.from < cd.left.to) {
                diffTextMarks.push(editorLeft.markText(
                    { line: idx, ch: cd.left.from }, { line: idx, ch: cd.left.to },
                    { className: 'diff-char-old' }
                ));
            }
        }
    });
    editorRight.operation(function() {
        for (var i = 0; i < rightAnno.length; i++) {
            if (rightAnno[i] === 'modified') editorRight.addLineClass(i, 'background', 'diff-line-modified');
            else if (rightAnno[i] === 'added') editorRight.addLineClass(i, 'background', 'diff-line-added');
            else if (rightAnno[i] === 'spacer') editorRight.addLineClass(i, 'background', 'diff-line-spacer');
        }
        var charKeys = Object.keys(charDiffs);
        for (var ci = 0; ci < charKeys.length; ci++) {
            var idx = parseInt(charKeys[ci]);
            var cd = charDiffs[idx];
            if (cd.right.from < cd.right.to) {
                diffTextMarks.push(editorRight.markText(
                    { line: idx, ch: cd.right.from }, { line: idx, ch: cd.right.to },
                    { className: 'diff-char-new' }
                ));
            }
        }
    });

    // 右侧框体边框
    applyRightBorders(rightAnno);
    // 双侧 Gutter 标记
    applyGutterMarkers(leftAnno, rightAnno);
}

// --- 折叠透视徽章：在右侧折叠行末尾显示差异类型小圆点 ---
let _badgeTimer = null;
function scheduleBadgeUpdate() {
    if (_badgeTimer) clearTimeout(_badgeTimer);
    _badgeTimer = setTimeout(updateDiffBadges, 30);
}

function updateDiffBadges() {
    _badgeTimer = null;
    if (!isDiffMode) return;

    diffBookmarks.forEach(b => b.clear());
    diffBookmarks = [];

    const cm = editorRight;
    const rightAnno = window._diffRightAnno;
    const leftAnno = window._diffLeftAnno;
    if (!rightAnno) return;

    // 高性能路径：用 getAllMarks() 一次性拿到所有折叠标记，而非逐行 findMarksAt
    const allMarks = cm.getAllMarks();
    const foldLines = [];
    for (var mi = 0; mi < allMarks.length; mi++) {
        var mk = allMarks[mi];
        if (!mk.__isFold) continue;
        var range = mk.find();
        if (!range) continue;
        foldLines.push({ line: range.from.line, from: range.from.line, to: range.to.line });
    }

    cm.operation(function() {
        for (var fi = 0; fi < foldLines.length; fi++) {
            var fl = foldLines[fi];
            var types = 0; // bitmask: 1=added, 2=removed, 4=modified
            for (var j = fl.from; j <= fl.to; j++) {
                var ra = rightAnno[j];
                if (ra === 'added') types |= 1;
                else if (ra === 'modified') types |= 4;
                else if (ra === 'spacer' && leftAnno[j] === 'removed') types |= 2;
                if (types === 7) break; // 三种类型都有了，提前退出
            }
            if (types === 0) continue;

            var badge = document.createElement('span');
            badge.className = 'diff-badge-container';
            if (types & 1) { var d = document.createElement('span'); d.className = 'diff-badge-dot diff-badge-added'; badge.appendChild(d); }
            if (types & 2) { var d = document.createElement('span'); d.className = 'diff-badge-dot diff-badge-removed'; badge.appendChild(d); }
            if (types & 4) { var d = document.createElement('span'); d.className = 'diff-badge-dot diff-badge-modified'; badge.appendChild(d); }

            var lineText = cm.getLine(fl.line) || '';
            var bm = cm.setBookmark(CodeMirror.Pos(fl.line, lineText.length), { widget: badge, insertLeft: true });
            diffBookmarks.push(bm);
        }
    });
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
        scheduleBadgeUpdate();
        syncing = false;
    };
    const onUnfoldLeft = (cm, from) => {
        if (syncing || suppressSync) return; syncing = true;
        editorRight.foldCode(CodeMirror.Pos(from.line, 0), null, 'unfold');
        scheduleBadgeUpdate();
        syncing = false;
    };
    const onFoldRight = (cm, from) => {
        if (syncing || suppressSync) return; syncing = true;
        editorLeft.foldCode(CodeMirror.Pos(from.line, 0), isDiffMode ? diffBracketFold : null, 'fold');
        scheduleBadgeUpdate();
        syncing = false;
    };
    const onUnfoldRight = (cm, from) => {
        if (syncing || suppressSync) return; syncing = true;
        editorLeft.foldCode(CodeMirror.Pos(from.line, 0), null, 'unfold');
        scheduleBadgeUpdate();
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

    // 先格式化两边（含智能容错），全部成功后再执行对比
    smartFormatThenCompare();
}

// 依次格式化左右两侧，全部成功后执行对比
function smartFormatThenCompare() {
    formatJSON(editorLeft, function(leftOk) {
        if (!leftOk) return;
        formatJSON(editorRight, function(rightOk) {
            if (!rightOk) return;

            var leftObj, rightObj;
            try { leftObj = JSON.parse(editorLeft.getValue()); }
            catch(e) { alert('左侧 JSON 解析失败：\n' + e.message); return; }
            try { rightObj = JSON.parse(editorRight.getValue()); }
            catch(e) { alert('右侧 JSON 解析失败：\n' + e.message); return; }

            executeCompare(leftObj, rightObj);
        });
    });
}

function tryParse(text) {
    try { return { ok: true, val: JSON.parse(text) }; }
    catch(e) { return { ok: false, err: e.message }; }
}

// --- 智能容错检测器 ---
function detectJsonIssues(text) {
    var fixes = [];
    var positions = []; // {line, ch, len, desc}
    var fixed = text;

    // 统计行偏移表（用于将全局 index 转换为 line:ch）
    var lineOffsets = [0];
    for (var i = 0; i < text.length; i++) {
        if (text[i] === '\n') lineOffsets.push(i + 1);
    }
    function posOf(idx) {
        var lo = 0, hi = lineOffsets.length - 1;
        while (lo < hi) {
            var mid = (lo + hi + 1) >> 1;
            if (lineOffsets[mid] <= idx) lo = mid; else hi = mid - 1;
        }
        return { line: lo, ch: idx - lineOffsets[lo] };
    }

    // 1. BOM / 不可见字符
    var bomRe = /[\uFEFF\u200B\u200C\u200D\u00A0]/g;
    var m;
    while ((m = bomRe.exec(text)) !== null) {
        var p = posOf(m.index);
        var desc = m[0] === '\uFEFF' ? 'BOM标记' : m[0] === '\u00A0' ? '不间断空格' : '零宽字符';
        positions.push({ line: p.line, ch: p.ch, len: 1, desc: desc });
    }
    fixes.push({ name: 'BOM/不可见字符', count: positions.length });
    fixed = fixed.replace(bomRe, '');

    // 2. 中文标点
    var cnPuncMap = {
        '\uff0c': ',', '\uff1a': ':', '\uff1b': ';',
        '\u201c': '"', '\u201d': '"', '\u2018': "'", '\u2019': "'",
        '\u3000': ' ', '\uff08': '(', '\uff09': ')',
        '\uff3b': '[', '\uff3d': ']', '\uff5b': '{', '\uff5d': '}'
    };
    var cnKeys = Object.keys(cnPuncMap);
    var cnRe = new RegExp('[' + cnKeys.join('') + ']', 'g');
    var cnCount = 0;
    // 在原始 text 上检测位置（用于高亮）
    while ((m = cnRe.exec(text)) !== null) {
        var p = posOf(m.index);
        positions.push({ line: p.line, ch: p.ch, len: 1, desc: '中文标点 ' + m[0] + ' → ' + cnPuncMap[m[0]] });
        cnCount++;
    }
    if (cnCount > 0) fixes.push({ name: '中文标点', count: cnCount });
    fixed = fixed.replace(cnRe, function(ch) { return cnPuncMap[ch] || ch; });

    // 3-6 下面的检测在已经修复 BOM 和中文标点之后的文本上进行
    var working = fixed;

    // 3. 单引号 → 双引号（仅在字符串值的 JSON 结构位置，不在双引号字符串内）
    var singleQuoteCount = 0;
    working = working.replace(/'((?:[^'\\]|\\.)*)'/g, function(match, inner, offset) {
        // 简单检测是否在合理的 JSON 位置（键名或字符串值前后常有 : , [ { 等）
        singleQuoteCount++;
        return '"' + inner.replace(/"/g, '\\"') + '"';
    });
    if (singleQuoteCount > 0) fixes.push({ name: '单引号→双引号', count: singleQuoteCount });

    // 4. 行尾注释 // 和块注释 /* */
    var commentCount = 0;
    working = working.replace(/\/\/[^\n]*/g, function() { commentCount++; return ''; });
    working = working.replace(/\/\*[\s\S]*?\*\//g, function() { commentCount++; return ''; });
    if (commentCount > 0) fixes.push({ name: '注释', count: commentCount });

    // 5. 尾逗号（] 或 } 前的逗号）
    var trailingCount = 0;
    working = working.replace(/,(\s*[}\]])/g, function(m, after) { trailingCount++; return after; });
    if (trailingCount > 0) fixes.push({ name: '尾部逗号', count: trailingCount });

    // 6. 无引号键名
    var unquotedCount = 0;
    working = working.replace(/([{,]\s*)([a-zA-Z_$][\w$]*)(\s*:)/g, function(m, before, key, after) {
        unquotedCount++;
        return before + '"' + key + '"' + after;
    });
    if (unquotedCount > 0) fixes.push({ name: '无引号键名', count: unquotedCount });

    fixed = working;

    // 7. 缺少逗号检测（仅标记不修复）：在修复后的文本上扫描常见的缺逗号模式
    // 需要在原始 text 上定位，所以用原始文本的行来检查
    var missingCommaCount = 0;
    var origLines = text.split('\n');
    for (var li = 0; li < origLines.length - 1; li++) {
        var curLine = origLines[li].trimEnd();
        var nextLine = origLines[li + 1].trim();
        if (!curLine || !nextLine) continue;

        var curEnds = curLine[curLine.length - 1];
        var nextStarts = nextLine[0];

        // 当前行末尾不是 , : { [ ( 且下一行开头是 " { [ 或字母数字 → 疑似缺逗号
        var noCommaEnds = (curEnds === '"' || curEnds === '}' || curEnds === ']' ||
                           curEnds === 'e' || curEnds === 'l' || // true/false/null
                           /[0-9]/.test(curEnds));
        var validNextStarts = (nextStarts === '"' || nextStarts === '{' || nextStarts === '[' ||
                                nextStarts === 't' || nextStarts === 'f' || nextStarts === 'n' ||
                                /[0-9\-]/.test(nextStarts));

        if (noCommaEnds && validNextStarts) {
            // 排除：当前行末尾是开括号 { [ 或冒号 :，那不需要逗号
            if (curEnds === '{' || curEnds === '[' || curEnds === ':') continue;
            // 排除：下一行开头是闭括号 } ]，那结尾不应该有逗号
            if (nextStarts === '}' || nextStarts === ']') continue;

            // 找到原始行中末尾字符的精确位置
            var origEndCh = origLines[li].length;
            positions.push({
                line: li,
                ch: origEndCh - 1,
                len: 1,
                desc: '此处可能缺少逗号'
            });
            missingCommaCount++;
        }
    }
    if (missingCommaCount > 0) fixes.push({ name: '疑似缺少逗号（需手动修复）', count: missingCommaCount, manualOnly: true });

    // 过滤掉 count=0 的
    fixes = fixes.filter(function(f) { return f.count > 0; });

    return { fixes: fixes, positions: positions, fixed: fixed };
}

// 高亮问题位置（红色下划线 + 背景）
function highlightIssues(cm, positions, markers) {
    cm.operation(function() {
        for (var i = 0; i < positions.length; i++) {
            var p = positions[i];
            if (p.line < cm.lineCount()) {
                var mk = cm.markText(
                    { line: p.line, ch: p.ch },
                    { line: p.line, ch: p.ch + p.len },
                    { className: 'json-issue-highlight', title: p.desc }
                );
                markers.push(mk);
            }
        }
    });
}

function executeCompare(leftObj, rightObj) {
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

    // 步骤5: 切换 fold gutter 为自定义 range finder
    editorLeft.setOption('foldGutter', { rangeFinder: diffBracketFold });
    editorRight.setOption('foldGutter', { rangeFinder: diffBracketFold });

    // 步骤6: 启用双边同步
    enableDiffSync();

    // 步骤7: 折叠到第一级
    foldToLevel(editorLeft, 1);
    foldToLevel(editorRight, 1);

    // 步骤8: 更新折叠透视徽章
    scheduleBadgeUpdate();
}

document.getElementById('compare-btn').addEventListener('click', runCompare);

