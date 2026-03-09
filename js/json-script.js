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
    } else if (checkShortcut(shortcuts.lv2)) {
        e.preventDefault(); 
        e.stopPropagation();
        foldToLevel(editorLeft, 2); foldToLevel(editorRight, 2);
    } else if (checkShortcut(shortcuts.unfold)) {
        e.preventDefault();
        e.stopPropagation();
        unfoldAll(editorLeft); unfoldAll(editorRight);
    }
}, true); // <- 关键点：设置为 true，在捕获阶段拦截事件

function unfoldAll(cm) {
    if (!cm) return;
    cm.operation(() => {
        // 安全遍历所有行进行强制展开
        for (let i = cm.firstLine(); i <= cm.lastLine(); i++) {
            cm.foldCode(CodeMirror.Pos(i, 0), null, "unfold");
        }
    });
}

// 层级折叠辅助 (重构版：基于真实的结构深度而非缩进空格数量，兼容任意格式化的 JSON)
function foldToLevel(cm, level) {
    if (!cm) return;
    
    cm.operation(() => {
        // Step 1: 先全部展开，彻底消除旧的折叠造成的错乱和干扰
        for (let i = cm.firstLine(); i <= cm.lastLine(); i++) {
            cm.foldCode(CodeMirror.Pos(i, 0), null, "unfold");
        }
        
        // Step 2: 重新通过括号匹配计算真实的层级深度（Depth Level）
        let depths = [];
        let currentDepth = 0;
        for (let i = cm.firstLine(); i <= cm.lastLine(); i++) {
            depths[i] = currentDepth; // 记录当前行开启时的深度
            let lineText = cm.getLine(i);
            
            // 粗略过滤掉字符串内容，防止字符串内部的 "{" 干扰层级计算
            let cleanText = lineText.replace(/\\"/g, '').replace(/"[^"]*"/g, '');
            for (let char of cleanText) {
                if (char === '{' || char === '[') currentDepth++;
                else if (char === '}' || char === ']') currentDepth--;
            }
        }
        
        // Step 3: 根据真实深度精确执行折叠
        // 凡是深度达到目标要求的对象/数组，均做折叠包裹
        for (let i = cm.firstLine(); i <= cm.lastLine(); i++) {
            let lineText = cm.getLine(i);
            
            // 只要该行命中深度，且含括起手符就尝试折叠 (如果是字符串内的不管，CodeMirror 内部会忽略无效 fold指令)
            if (depths[i] >= level) {
                if (lineText.includes('{') || lineText.includes('[')) {
                    cm.foldCode(CodeMirror.Pos(i, 0), null, "fold");
                }
            }
        }
    });
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

