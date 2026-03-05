// === CodeMirror 初始实例 ===
const cmOptions = {
    mode: "application/json",
    lineNumbers: true,
    foldGutter: true,
    gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
    matchBrackets: true,
    tabSize: 2
};

const editorLeft = CodeMirror.fromTextArea(document.getElementById("json-input-left"), cmOptions);
const editorRight = CodeMirror.fromTextArea(document.getElementById("json-input-right"), cmOptions);

// == 快捷键默认设置 ===
let shortcuts = {
    lv1: { ctrl: true, shift: true, key: "1" },
    lv2: { ctrl: true, shift: true, key: "2" },
    unfold: { ctrl: true, shift: true, key: "0" }
};

// === 设置逻辑与主题切换 ===
const htmlEl = document.documentElement;
const themeToggleBtn = document.getElementById('theme-toggle');
const schemeSelect = document.getElementById('scheme-select');
const fontSelect = document.getElementById('font-select');
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings');

themeToggleBtn.addEventListener('click', () => {
    const isDark = htmlEl.getAttribute('data-theme') === 'dark';
    htmlEl.setAttribute('data-theme', isDark ? 'light' : 'dark');
});

schemeSelect.addEventListener('change', (e) => {
    htmlEl.setAttribute('data-scheme', e.target.value);
});

fontSelect.addEventListener('change', (e) => {
    const font = e.target.value;
    document.querySelectorAll('.CodeMirror').forEach(el => {
        el.style.fontFamily = font;
    });
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
fontSizeSlider.addEventListener('input', (e) => {
    const size = e.target.value;
    fontSizeVal.textContent = size + 'px';
    document.querySelectorAll('.CodeMirror').forEach(el => {
        el.style.fontSize = size + 'px';
    });
    editorLeft.refresh();
    editorRight.refresh();
});

// 快捷键捕获录入
function bindShortcutInput(inputId, targetObjKey) {
    const input = document.getElementById(inputId);
    input.addEventListener('keydown', (e) => {
        e.preventDefault();
        input.blur();
        
        const isCtrl = e.ctrlKey || e.metaKey;
        const isShift = e.shiftKey;
        const key = e.key.toUpperCase();
        
        // 忽略纯修饰键
        if (key === 'CONTROL' || key === 'SHIFT' || key === 'ALT' || key === 'META') return;
        if (key === 'BACKSPACE' || key === 'DELETE') {
            input.value = '';
            shortcuts[targetObjKey] = null; // Clear
            return;
        }
        
        let displayStr = [];
        if (isCtrl) displayStr.push('Ctrl');
        if (isShift) displayStr.push('Shift');
        displayStr.push(key === ' ' ? 'SPACE' : key);
        
        input.value = displayStr.join('+');
        shortcuts[targetObjKey] = { ctrl: isCtrl, shift: isShift, key: key === ' ' ? ' ' : key };
    });
}
bindShortcutInput('shortcut-lv1', 'lv1');
bindShortcutInput('shortcut-lv2', 'lv2');
bindShortcutInput('shortcut-unfold', 'unfold');

// 全局快捷键拦截器
window.addEventListener('keydown', (e) => {
    // 如果焦点在输入框/录入框上，不要触发折叠快捷键
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    const checkShortcut = (def) => def && (e.ctrlKey || e.metaKey) === def.ctrl && e.shiftKey === def.shift && e.key.toUpperCase() === def.key;
    
    if (checkShortcut(shortcuts.lv1)) {
        e.preventDefault(); 
        foldToLevel(editorLeft, 1); foldToLevel(editorRight, 1);
    } else if (checkShortcut(shortcuts.lv2)) {
        e.preventDefault(); 
        foldToLevel(editorLeft, 2); foldToLevel(editorRight, 2);
    } else if (checkShortcut(shortcuts.unfold)) {
        e.preventDefault();
        unfoldAll(editorLeft); unfoldAll(editorRight);
    }
});

function unfoldAll(cm) {
    cm.operation(() => {
        for (let i = cm.firstLine(); i <= cm.lastLine(); i++) {
            cm.foldCode(CodeMirror.Pos(i, 0), null, "unfold");
        }
    });
}

// 层级折叠辅助
function foldToLevel(cm, level) {
    const targetIndent = (level - 1) * cm.getOption("tabSize");
    cm.operation(() => {
        for (let i = cm.firstLine(); i <= cm.lastLine(); i++) {
            let lineText = cm.getLine(i);
            let indent = lineText.search(/\S/);
            if (indent !== -1) {
                if (indent >= targetIndent && indent > 0) {
                    cm.foldCode(CodeMirror.Pos(i, 0), null, "fold");
                } else if (indent < targetIndent) {
                    cm.foldCode(CodeMirror.Pos(i, 0), null, "unfold");
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
        editor.setValue(JSON.stringify(obj, null, 2));
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

