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
        
        let displayStr = [];
        if (isCtrl) displayStr.push('Ctrl');
        if (isShift) displayStr.push('Shift');
        displayStr.push(key);
        
        input.value = displayStr.join('+');
        shortcuts[targetObjKey] = { ctrl: isCtrl, shift: isShift, key: key };
    });
}
bindShortcutInput('shortcut-lv1', 'lv1');
bindShortcutInput('shortcut-lv2', 'lv2');
bindShortcutInput('shortcut-unfold', 'unfold');

// 全局快捷键拦截器
window.addEventListener('keydown', (e) => {
    const checkShortcut = (def) => (e.ctrlKey || e.metaKey) === def.ctrl && e.shiftKey === def.shift && e.key.toUpperCase() === def.key;
    
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
