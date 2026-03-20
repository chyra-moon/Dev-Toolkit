// === Section ===
const STORAGE_KEY = 'json_diff_settings';

const defaultSettings = {
    theme: 'light',
    scheme: 'evalight',
    font: "'JetBrains Mono', Consolas, 'Courier New', monospace",
    fontSize: 14,
    fontWeight: 400,
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
        // note
        if (!parsed._migrated_v2) {
            if (parsed.scheme === 'vscode') userSettings.scheme = defaultSettings.scheme;
            if (parsed.font === "Consolas, 'Courier New', monospace") userSettings.font = defaultSettings.font;
            userSettings._migrated_v2 = true;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(userSettings));
        }
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

// === Section ===
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

// === Section ===
(function initBracketScopeAndGuides() {
    var OPENERS = '{[', CLOSERS = '}]', PAIRS = {'{':'}', '[':']'};

    function setup(editor) {
        var wrapper = editor.getWrapperElement();
        var guidesLayer = document.createElement('div');
        guidesLayer.className = 'indent-guides-layer';
        wrapper.appendChild(guidesLayer);

        var guidePool = [], bracketMarks = [], activeBracketLevel = -1, rafId = null;

        function getGuideEl(idx) {
            if (idx < guidePool.length) { guidePool[idx].style.display = ''; return guidePool[idx]; }
            var el = document.createElement('div');
            el.className = 'indent-guide';
            guidesLayer.appendChild(el);
            guidePool.push(el);
            return el;
        }

        // note

        function findEnclosingBrackets(cursor) {
            var depth = 0, openPos = null, openChar = null;
            // note

            for (var l = cursor.line; l >= 0; l--) {
                var text = editor.getLine(l);
                var from = (l === cursor.line) ? cursor.ch - 1 : text.length - 1;
                for (var c = from; c >= 0; c--) {
                    var ch = text[c];
                    if (OPENERS.indexOf(ch) === -1 && CLOSERS.indexOf(ch) === -1) continue;
                    var tt = editor.getTokenTypeAt({line: l, ch: c + 1});
                    if (tt && tt.indexOf('string') !== -1) continue;
                    if (CLOSERS.indexOf(ch) !== -1) { depth++; }
                    else {
                        if (depth === 0) { openPos = {line: l, ch: c}; openChar = ch; break; }
                        depth--;
                    }
                }
                if (openPos) break;
            }
            if (!openPos) return null;
            // note

            var closeChar = PAIRS[openChar];
            depth = 0;
            var last = editor.lastLine();
            for (var l = openPos.line; l <= last; l++) {
                var text = editor.getLine(l);
                var from = (l === openPos.line) ? openPos.ch + 1 : 0;
                for (var c = from; c < text.length; c++) {
                    var ch = text[c];
                    if (ch !== openChar && ch !== closeChar) continue;
                    var tt = editor.getTokenTypeAt({line: l, ch: c + 1});
                    if (tt && tt.indexOf('string') !== -1) continue;
                    if (ch === openChar) { depth++; }
                    else {
                        if (depth === 0) return { open: openPos, close: {line: l, ch: c} };
                        depth--;
                    }
                }
            }
            return null;
        }

        // note

        function renderGuides() {
            var vp = editor.getViewport();
            var charW = editor.defaultCharWidth();
            var lineH = editor.defaultTextHeight();
            var wRect = wrapper.getBoundingClientRect();
            var guideIdx = 0;

            // note
            var lines = [];
            for (var i = vp.from; i < vp.to; i++) {
                var text = editor.getLine(i);
                if (text === undefined) break;
                var sp = 0;
                for (var j = 0; j < text.length; j++) {
                    if (text[j] === ' ') sp++;
                    else if (text[j] === '\t') sp += currentTabSize;
                    else break;
                }
                lines.push({ num: i, level: text.trim() === '' ? -1 : Math.floor(sp / currentTabSize), empty: text.trim() === '' });
            }
            // note

            for (var i = 0; i < lines.length; i++) {
                if (lines[i].empty) {
                    var p = i > 0 ? lines[i - 1].level : 0;
                    var n = i < lines.length - 1 ? lines[i + 1].level : 0;
                    lines[i].level = Math.max(p, n);
                }
            }
            if (!lines.length) {
                for (var i = 0; i < guidePool.length; i++) guidePool[i].style.display = 'none';
                return;
            }

            // note

            var maxLvl = 0;
            for (var i = 0; i < lines.length; i++) if (lines[i].level > maxLvl) maxLvl = lines[i].level;
            var xBase = editor.charCoords({line: lines[0].num, ch: 0}, 'window').left - wRect.left;

            // note
            for (var lvl = 1; lvl <= maxLvl; lvl++) {
                var runStart = -1;
                for (var i = 0; i <= lines.length; i++) {
                    var has = i < lines.length && lines[i].level >= lvl;
                    if (has && runStart === -1) { runStart = i; }
                    else if (!has && runStart !== -1) {
                        var sLine = lines[runStart].num, eLine = lines[i - 1].num;
                        var topY = editor.charCoords({line: sLine, ch: 0}, 'window').top - wRect.top;
                        var botY = editor.charCoords({line: eLine, ch: 0}, 'window').top - wRect.top + lineH;

                        var el = getGuideEl(guideIdx++);
                        el.style.left = (xBase + (lvl - 1) * currentTabSize * charW) + 'px';
                        el.style.top = topY + 'px';
                        el.style.height = (botY - topY) + 'px';
                        if (lvl === activeBracketLevel) el.classList.add('indent-guide-active');
                        else el.classList.remove('indent-guide-active');
                        runStart = -1;
                    }
                }
            }
            // note
            for (var i = guideIdx; i < guidePool.length; i++) guidePool[i].style.display = 'none';
        }

        // note
        function onCursorActivity() {
            bracketMarks.forEach(function(m) { m.clear(); });
            bracketMarks = [];
            activeBracketLevel = -1;

            var cursor = editor.getCursor();
            var result = findEnclosingBrackets(cursor);
            if (result) {
                bracketMarks.push(editor.markText(
                    result.open, {line: result.open.line, ch: result.open.ch + 1},
                    {className: 'cm-bracket-highlight'}
                ));
                bracketMarks.push(editor.markText(
                    result.close, {line: result.close.line, ch: result.close.ch + 1},
                    {className: 'cm-bracket-highlight'}
                ));
                // note

                var openText = editor.getLine(result.open.line);
                var sp = 0;
                for (var j = 0; j < openText.length; j++) {
                    if (openText[j] === ' ') sp++;
                    else if (openText[j] === '\t') sp += currentTabSize;
                    else break;
                }
                activeBracketLevel = Math.floor(sp / currentTabSize) + 1;
            }
            scheduleRender();
        }

        function scheduleRender() {
            if (rafId) cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(renderGuides);
        }

        editor.on('cursorActivity', onCursorActivity);
        editor.on('viewportChange', scheduleRender);
        editor.on('scroll', scheduleRender);
        editor.on('change', function() { setTimeout(scheduleRender, 30); });
        editor.on('refresh', scheduleRender);
        setTimeout(renderGuides, 200);

        return { scheduleRender: scheduleRender, findEnclosingBrackets: findEnclosingBrackets, editor: editor };
    }

    var leftGuides = setup(editorLeft);
    var rightGuides = setup(editorRight);

    // note
    window._refreshIndentGuides = function() {
        leftGuides.scheduleRender();
        rightGuides.scheduleRender();
    };

    // === Section ===

    function setupAltDblClick(editor) {
        editor.getWrapperElement().addEventListener('dblclick', function(e) {
            if (!e.altKey) return;
            e.preventDefault();
            var pos = editor.coordsChar({left: e.clientX, top: e.clientY});
            var lineText = editor.getLine(pos.line);
            if (!lineText) return;
            // note
            var colonIdx = -1;
            var inStr = false;
            for (var i = 0; i < lineText.length; i++) {
                if (lineText[i] === '"') inStr = !inStr;
                if (!inStr && lineText[i] === ':') { colonIdx = i; break; }
            }
            if (colonIdx === -1) return;
            // note
            var valStart = colonIdx + 1;
            while (valStart < lineText.length && lineText[valStart] === ' ') valStart++;
            if (valStart >= lineText.length) return;
            var startChar = lineText[valStart];
            var from = {line: pos.line, ch: valStart};
            var to;
            if (startChar === '{' || startChar === '[') {
                // note

                var closeChar = startChar === '{' ? '}' : ']';
                var depth = 0, last = editor.lastLine();
                var found = false;
                for (var l = pos.line; l <= last; l++) {
                    var text = editor.getLine(l);
                    var s = (l === pos.line) ? valStart : 0;
                    for (var c = s; c < text.length; c++) {
                        var tt = editor.getTokenTypeAt({line: l, ch: c + 1});
                        if (tt && tt.indexOf('string') !== -1) continue;
                        if (text[c] === startChar) depth++;
                        else if (text[c] === closeChar) {
                            depth--;
                            if (depth === 0) { to = {line: l, ch: c + 1}; found = true; break; }
                        }
                    }
                    if (found) break;
                }
                if (!to) return;
            } else {
                // note
                var end = lineText.length;
                var trimmed = lineText.trimEnd();
                if (trimmed.endsWith(',')) end = trimmed.length - 1;
                else end = trimmed.length;
                to = {line: pos.line, ch: end};
            }
            editor.setSelection(from, to);
            var text = editor.getSelection();
            if (text) navigator.clipboard.writeText(text);
        });
    }
    setupAltDblClick(editorLeft);
    setupAltDblClick(editorRight);
})();

// === Section ===
let debounceTimer;
let pauseAutoSaveDepth = 0;

function withAutoSavePaused(fn) {
    pauseAutoSaveDepth++;
    try {
        return fn();
    } finally {
        pauseAutoSaveDepth = Math.max(0, pauseAutoSaveDepth - 1);
    }
}

function debounceSave() {
    if (pauseAutoSaveDepth > 0) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        const mode = htmlEl.getAttribute('data-mode') || 'single';
        if (mode === 'single') {
            localStorage.setItem('json_single_data', editorLeft.getValue());
        } else {
            localStorage.setItem('json_compare_left', editorLeft.getValue());
            localStorage.setItem('json_compare_right', editorRight.getValue());
        }
    }, 500);
}

// note
editorRight.on('change', debounceSave);

// note
function restoreState() {

    const mode = htmlEl.getAttribute('data-mode') || 'single';
    if (mode === 'single') {
        const singleData = localStorage.getItem('json_single_data');
        if (singleData !== null) {
            withAutoSavePaused(() => editorLeft.setValue(singleData));
        }
    } else {
        const compLeft = localStorage.getItem('json_compare_left');
        const compRight = localStorage.getItem('json_compare_right');
        if (compLeft !== null) {
            withAutoSavePaused(() => editorLeft.setValue(compLeft));
        }
        if (compRight !== null) {
            withAutoSavePaused(() => editorRight.setValue(compRight));
        }
    }
}

// === Section ===
const htmlEl = document.documentElement;
const themeToggleBtn = document.getElementById('theme-toggle');
const schemeSelect = document.getElementById('scheme-select');
const fontSelect = document.getElementById('font-select');
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings');

// note
function applySettings() {
    htmlEl.setAttribute('data-theme', userSettings.theme);
    htmlEl.setAttribute('data-scheme', userSettings.scheme);
    
    if (schemeSelect) schemeSelect.value = userSettings.scheme;
    if (fontSelect) fontSelect.value = userSettings.font;
    
    document.querySelectorAll('.CodeMirror').forEach(el => {
        el.style.fontFamily = userSettings.font;
        el.style.fontSize = userSettings.fontSize + 'px';
        el.style.fontWeight = userSettings.fontWeight;
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
    // note
    editorLeft.refresh();
    editorRight.refresh();
});

settingsBtn.addEventListener('click', () => { settingsModal.style.display = 'flex'; });
closeSettingsBtn.addEventListener('click', () => { settingsModal.style.display = 'none'; });

// === Section ===
(function loadCustomFonts() {
    var select = document.getElementById('font-select');
    if (!select) return;
    fetch('../fonts/fonts.json')
        .then(function(res) { return res.ok ? res.json() : null; })
        .then(function(fonts) {
            if (!fonts || !Array.isArray(fonts) || fonts.length === 0) return;
            var group = document.createElement('optgroup');
            group.label = '自定义字体';
            fonts.forEach(function(f) {
                if (!f.name || typeof f.name !== 'string' || !f.file || typeof f.file !== 'string') return;
                if (!/^[\w\-. ()]+\.[a-zA-Z0-9]+$/.test(f.file)) return;
                var family = 'Custom_' + f.name.replace(/[^a-zA-Z0-9_]/g, '_');
                var style = document.createElement('style');
                style.textContent = '@font-face{font-family:"' + family + '";src:url("../fonts/' + encodeURIComponent(f.file) + '");font-display:swap}';
                document.head.appendChild(style);
                var opt = document.createElement('option');
                opt.value = "'" + family + "', monospace";
                opt.textContent = f.name;
                group.appendChild(opt);
            });
            if (group.children.length > 0) {
                select.insertBefore(group, select.firstChild);
            }
            // note
            if (userSettings.font) {
                select.value = userSettings.font;
                if (select.value !== userSettings.font) {
                    select.selectedIndex = 0;
                    userSettings.font = select.value;
                    document.querySelectorAll('.CodeMirror').forEach(function(el) {
                        el.style.fontFamily = select.value;
                    });
                    saveSettings();
                }
            }
        })
        .catch(function() {});
})();

// note
const tabBtns = document.querySelectorAll('.tab-btn');
const settingsPanes = document.querySelectorAll('.settings-pane');
tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        // note
        tabBtns.forEach(b => b.classList.remove('active'));
        settingsPanes.forEach(p => p.classList.remove('active'));
        
        // note
        btn.classList.add('active');
        const targetId = btn.getAttribute('data-target');
        document.getElementById(targetId).classList.add('active');
    });
});

// note
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

// note
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
        
        // note

        const silentFormat = (editor) => {
            try {
                const val = editor.getValue();
                if (!val.trim()) return;
                const obj = JSON.parse(val);
                // note
                editor.setValue(JSON.stringify(obj, null, currentTabSize));
            } catch(err) {
                // note
            }
        };
        silentFormat(editorLeft);
        silentFormat(editorRight);
    });
}

// note
const fontWeightSlider = document.getElementById('font-weight-slider');
const fontWeightVal = document.getElementById('font-weight-val');

if (fontWeightSlider) {
    fontWeightSlider.value = userSettings.fontWeight;
    fontWeightVal.textContent = userSettings.fontWeight;

    fontWeightSlider.addEventListener('input', (e) => {
        const weight = parseInt(e.target.value);
        fontWeightVal.textContent = weight;
        document.querySelectorAll('.CodeMirror').forEach(el => {
            el.style.fontWeight = weight;
        });
        userSettings.fontWeight = weight;
        saveSettings();
        editorLeft.refresh();
        editorRight.refresh();
    });
}

// note
function bindShortcutInput(inputId, targetObjKey) {

    const input = document.getElementById(inputId);
    
    input.addEventListener('focus', () => {
        input.value = '请按下组合键...';
        input.style.color = '#ef4444'; // recording hint
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
        e.stopPropagation(); // prevent bubbling
        
        const isCtrl = e.ctrlKey || e.metaKey;
        const isShift = e.shiftKey;
        const isAlt = e.altKey;
        
        // note
        const code = e.code || "";
        const key = e.key.toUpperCase();
        
        if (key === 'ESCAPE') {
            // note
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
        
        // note

        const isModifier = ['ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'].includes(code) || ['CONTROL', 'SHIFT', 'ALT', 'META'].includes(key);
        if (isModifier) {
            input.value = displayStr.join('+') + '+...';
            return;
        }
        
        // note
        let displayKey = key;
        if (code.startsWith('Key')) displayKey = code.replace('Key', '');
        else if (code.startsWith('Digit')) displayKey = code.replace('Digit', '');
        else if (key === ' ') displayKey = 'SPACE';

        displayStr.push(displayKey);
        
        // note

        const newShortcut = { ctrl: isCtrl, shift: isShift, alt: isAlt, code: code, key: key, displayKey: displayKey };
        shortcuts[targetObjKey] = newShortcut;
        userSettings.shortcuts[targetObjKey] = newShortcut;
        saveSettings();
        
        input.value = displayStr.join('+');
        input.blur();
    });
    
    // note
    if (input) input.dispatchEvent(new Event('blur'));
}
bindShortcutInput('shortcut-lv1', 'lv1');
bindShortcutInput('shortcut-lv2', 'lv2');
bindShortcutInput('shortcut-unfold', 'unfold');

// note
window.addEventListener('keydown', (e) => {
    // note

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

    // note

    if (e.target.tagName === 'INPUT' && e.target.closest('#settings-modal')) return;

    const checkShortcut = (def) => {
        if (!def) return false;
        
        const eventCode = (e.code || '');
        const eventKey = (e.key || '').toUpperCase();
        const defCode = (def.code || '');
        const defKey = (def.key || '').toUpperCase();
        
        const defKeyFromCode = defCode.replace(/^Digit/, '').replace(/^Numpad/, '').replace(/^Key/, '').toUpperCase();
        const eventKeyFromCode = eventCode.replace(/^Digit/, '').replace(/^Numpad/, '').replace(/^Key/, '').toUpperCase();

        // note

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
        Promise.all([foldToLevel(editorLeft, 1), foldToLevel(editorRight, 1)]).then(function() {
            if (isDiffMode) scheduleBadgeUpdate(true);
        });
    } else if (checkShortcut(shortcuts.lv2)) {
        e.preventDefault(); 
        e.stopPropagation();
        Promise.all([foldToLevel(editorLeft, 2), foldToLevel(editorRight, 2)]).then(function() {
            if (isDiffMode) scheduleBadgeUpdate(true);
        });
    } else if (checkShortcut(shortcuts.unfold)) {
        e.preventDefault();
        e.stopPropagation();
        unfoldAll(editorLeft); unfoldAll(editorRight);
        if (isDiffMode) scheduleBadgeUpdate(true);
    }
}, true); // capture phase: intercept before editor handles shortcuts

// note
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

// note
function foldToLevel(cm, level, opts) {
    if (!cm) return;
    var options = opts || {};
    var freshDoc = !!options.freshDoc;
    var chunked = !!options.chunked;
    var chunkSize = Math.max(20, options.chunkSize || 140);

    suppressSync = true;
    return new Promise(function(resolve) {
    cm.operation(function() {
        // note
        if (!freshDoc) {
            for (var i = cm.firstLine(); i <= cm.lastLine(); i++) {
                cm.foldCode(CodeMirror.Pos(i, 0), null, "unfold");
            }
        }

        // note

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

        // note
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

        // note
        foldable.sort(function(a, b) { return b.depth - a.depth; });

        var rf = isDiffMode ? diffBracketFold : null;
        if (!chunked || foldable.length <= chunkSize) {
            for (var fi = 0; fi < foldable.length; fi++) {
                cm.foldCode(CodeMirror.Pos(foldable[fi].line, 0), rf, "fold");
            }
            suppressSync = false;
            resolve();
            return;
        }

        var cursor = 0;
        function foldChunk() {
            var from = cursor;
            var to = Math.min(cursor + chunkSize, foldable.length);
            cm.operation(function() {
                for (var fi = from; fi < to; fi++) {
                    cm.foldCode(CodeMirror.Pos(foldable[fi].line, 0), rf, "fold");
                }
            });
            cursor = to;
            if (cursor < foldable.length) {
                requestAnimationFrame(foldChunk);
            } else {
                suppressSync = false;
                resolve();
            }
        }
        requestAnimationFrame(foldChunk);
    });
    });
}

// === Section ===

// note
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

    // note
    dismissIssueBar();

    var result = tryParse(val);
    if (result.ok) {
        editor.setValue(JSON.stringify(result.val, null, currentTabSize));
        if (callback) callback(true);
        return;
    }

    // note
    var issues = detectJsonIssues(val);
    if (issues.fixes.length === 0) {
        alert('格式化失败，请检查 JSON 语法是否正确\n' + result.err);
        if (callback) callback(false);
        return;
    }

    // note

    var autoFixable = issues.fixes.filter(function(f) { return !f.manualOnly; });

    // note

    var markers = [];
    highlightIssues(editor, issues.positions, markers);

    // note

    var side = (editor === editorLeft) ? '左侧' : '右侧';
    var summary = '【' + side + '】';
    summary += issues.fixes.map(function(f) { return f.name + ' ×' + f.count; }).join('；');

    // note
    showIssueBar(editor, summary, autoFixable.length > 0, markers, issues, callback);
}

function showIssueBar(editor, summary, hasAutoFix, markers, issues, callback) {
    // note

    var cmEl = editor.getWrapperElement();
    var panel = cmEl.closest('.editor-panel');
    if (!panel) panel = cmEl.parentElement;

    // note
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
            // note
            markers.forEach(function(m) { m.clear(); });
            markers.length = 0;

            var fixResult = tryParse(issues.fixed);
            if (!fixResult.ok) {
                // note
                editor.setValue(issues.fixed);

                var remaining = detectJsonIssues(issues.fixed);
                if (remaining.fixes.length > 0) {
                    highlightIssues(editor, remaining.positions, markers);
                    var side = (editor === editorLeft) ? '左侧' : '右侧';
                    textSpan.textContent = '【' + side + '】已修复部分问题，剩余：' +
                        remaining.fixes.map(function(f) { return f.name + ' ×' + f.count; }).join('；');
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

    // note
    var toolbar = panel.querySelector('.panel-toolbar');
    if (toolbar && toolbar.nextSibling) {
        panel.insertBefore(bar, toolbar.nextSibling);
    } else {
        panel.appendChild(bar);
    }

    _activeIssueBar = { barEl: bar, markers: markers };
}

// note
function copyContent(editor) {
    const val = editor.getValue();
    navigator.clipboard.writeText(val).then(() => {
        const btn = document.activeElement;
        const originalTitle = btn.title || '复制';
        btn.title = '复制成功';
        setTimeout(() => btn.title = originalTitle, 2000);
    }).catch(() => {
        alert('复制失败，请尝试手动复制');
    });
}

// note
document.getElementById('clear-left').addEventListener('click', () => editorLeft.setValue(''));
document.getElementById('format-left').addEventListener('click', () => formatJSON(editorLeft));
document.getElementById('copy-left').addEventListener('click', () => copyContent(editorLeft));
document.getElementById('search-left').addEventListener('click', () => editorLeft.execCommand('find'));

// note
document.getElementById('clear-right').addEventListener('click', () => editorRight.setValue(''));
document.getElementById('format-right').addEventListener('click', () => formatJSON(editorRight));
document.getElementById('copy-right').addEventListener('click', () => copyContent(editorRight));
document.getElementById('search-right').addEventListener('click', () => editorRight.execCommand('find'));

// note
document.getElementById('action-btn').addEventListener('click', function() {

    if ((document.documentElement.getAttribute('data-mode') || 'single') === 'single') {
        formatJSON(editorLeft);
    } else {
        runCompare();
    }
});

// === Section ===
(function initModeToggle() {
    const htmlEl = document.documentElement;
    const modeBtn = document.getElementById('mode-toggle');
    const pageTitle = document.getElementById('page-title');
    const actionBtn = document.getElementById('action-btn');
    const leftTitle = document.getElementById('left-panel-title');
    const rightPanel = document.querySelectorAll('.editor-panel')[1];

    function setMode(mode, isInit) {
        // note

        if (!isInit) {
            var prevMode = htmlEl.getAttribute('data-mode') || 'single';
            if (prevMode === 'single') {
                localStorage.setItem('json_single_data', editorLeft.getValue());
            } else {
                localStorage.setItem('json_compare_left', editorLeft.getValue());
                localStorage.setItem('json_compare_right', editorRight.getValue());
            }
        }

        htmlEl.setAttribute('data-mode', mode);
        localStorage.setItem('json_mode', mode);
        const isSingle = mode === 'single';

        // note
        setTimeout(() => {

            if (isSingle) {
                const singleData = localStorage.getItem('json_single_data');
                if (singleData !== null) {
                    withAutoSavePaused(() => editorLeft.setValue(singleData));
                }
            } else {
                const compLeft = localStorage.getItem('json_compare_left');
                const compRight = localStorage.getItem('json_compare_right');
                if (compLeft !== null) {
                    withAutoSavePaused(() => editorLeft.setValue(compLeft));
                }
                if (compRight !== null) {
                    withAutoSavePaused(() => editorRight.setValue(compRight));
                }
            }
        }, 0);

        // note
        pageTitle.textContent = isSingle ? 'JSON 格式化' : 'JSON 差异比对';
        actionBtn.textContent = isSingle ? '格式化' : '执行比对';
        leftTitle.textContent = isSingle ? 'JSON 编辑器' : '源 JSON';

        // tooltip
        modeBtn.title = isSingle ? '切换到对比模式' : '切换到单 JSON 模式';

        // note
        setTimeout(function() {
            editorLeft.refresh();
            if (!isSingle) editorRight.refresh();
        }, 460);
    }

    modeBtn.addEventListener('click', function() {
        var current = htmlEl.getAttribute('data-mode') || 'single';
        setMode(current === 'single' ? 'compare' : 'single', false);
    });

    // note
    var savedMode = localStorage.getItem('json_mode') || 'single';
    setMode(savedMode, true);
})();

// === Section ===


let isDiffMode = false;
let diffSyncCleanup = null;
let diffTextMarks = [];
let diffBookmarks = [];
let suppressSync = false;
let diffRenderToken = 0;
let diffAnnoStats = null;
let rightFoldRangesCache = null;
let rightFoldRangesDirty = true;

let compareWorker = null;
let compareRequestSeq = 0;
let activeCompareRunSeq = 0;
const pendingCompareRequests = new Map();
let workerUnavailableNotified = false;

// note
function sortObjectKeys(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(sortObjectKeys);
    const sorted = {};
    Object.keys(obj).sort((a, b) => a.localeCompare(b)).forEach(key => {
        sorted[key] = sortObjectKeys(obj[key]);
    });
    return sorted;
}

// note
function deepCompare(oldVal, newVal) {
    if (oldVal === undefined && newVal === undefined) return { status: 'unchanged' };
    if (oldVal === undefined) return { status: 'added', newValue: newVal };
    if (newVal === undefined) return { status: 'removed', oldValue: oldVal };

    if (oldVal === null && newVal === null) return { status: 'unchanged' };
    if (oldVal === null || newVal === null) return { status: 'modified', oldValue: oldVal, newValue: newVal };

    // note

    const oldIsArr = Array.isArray(oldVal);
    const newIsArr = Array.isArray(newVal);
    if (typeof oldVal !== typeof newVal || oldIsArr !== newIsArr) {
        return { status: 'modified', oldValue: oldVal, newValue: newVal };
    }

    if (oldIsArr) return deepCompareArrays(oldVal, newVal);
    if (typeof oldVal === 'object') return deepCompareObjects(oldVal, newVal);

    // note
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
    // note

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
            // note
            child = deepCompare(p.oldVal, p.newVal);
            child._oldVal = p.oldVal;
            child._newVal = p.newVal;
            if (child.status !== 'unchanged') hasChanges = true;
        }
        children.push(child);
    }
    return { type: 'array', status: hasChanges ? 'modified' : 'unchanged', children: children };
}

// note
function matchArrayElements(oldArr, newArr) {
    var oldLen = oldArr.length, newLen = newArr.length;
    if (oldLen === 0 && newLen === 0) return [];
    if (oldLen === 0) return newArr.map(function(v) { return { type: 'added', newVal: v }; });
    if (newLen === 0) return oldArr.map(function(v) { return { type: 'removed', oldVal: v }; });

    // note

    var allOldObj = true, allNewObj = true;
    for (var i = 0; i < oldLen; i++) { if (oldArr[i] === null || typeof oldArr[i] !== 'object' || Array.isArray(oldArr[i])) { allOldObj = false; break; } }
    for (var i = 0; i < newLen; i++) { if (newArr[i] === null || typeof newArr[i] !== 'object' || Array.isArray(newArr[i])) { allNewObj = false; break; } }

    if (allOldObj && allNewObj) {
        var pk = detectPrimaryKey(oldArr, newArr);
        if (pk) return matchByPrimaryKey(oldArr, newArr, pk);
    }

    // note

    return matchByContent(oldArr, newArr);
}

// note
function detectPrimaryKey(oldArr, newArr) {
    function isLikelyStableKeyName(field) {
        var f = String(field || '').toLowerCase();
        if (!f) return false;
        return (
            f === 'id' || f === '_id' || f.endsWith('_id') || f.startsWith('id_') ||
            f === 'uuid' || f.endsWith('_uuid') ||
            f === 'code' || f.endsWith('_code') ||
            f === 'key' || f.endsWith('_key') ||
            f === 'pk' || f.endsWith('_pk')
        );
    }

    function buildUniqueScalarMap(arr, field) {
        var map = Object.create(null);
        for (var i = 0; i < arr.length; i++) {
            var v = arr[i][field];
            if (v === undefined || v === null || typeof v === 'object') return null;
            var sv = String(v);
            if (Object.prototype.hasOwnProperty.call(map, sv)) return null;
            map[sv] = true;
        }
        return map;
    }

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

    var keys = Object.keys(candidateKeys);
    var keyByLower = Object.create(null);
    for (var ki = 0; ki < keys.length; ki++) {
        var kLower = keys[ki].toLowerCase();
        if (keyByLower[kLower] === undefined) keyByLower[kLower] = keys[ki];
    }

    var preferred = ['id', '_id', 'uuid', 'code', 'key', 'pk'];
    var ordered = [];
    for (var pi = 0; pi < preferred.length; pi++) {
        var exact = keyByLower[preferred[pi]];
        if (exact !== undefined) ordered.push(exact);
    }
    for (var ki = 0; ki < keys.length; ki++) {
        var field = keys[ki];
        if (ordered.indexOf(field) !== -1) continue;
        if (isLikelyStableKeyName(field)) ordered.push(field);
    }

    if (ordered.length === 0) return null;

    // note

    for (var ci = 0; ci < ordered.length; ci++) {
        var field = ordered[ci];
        var oldVals = buildUniqueScalarMap(oldArr, field);
        if (!oldVals) continue;
        var newVals = buildUniqueScalarMap(newArr, field);
        if (!newVals) continue;
        return field;
    }
    return null;
}

// note
function matchByPrimaryKey(oldArr, newArr, pk) {

    var oldMap = {};
    for (var i = 0; i < oldArr.length; i++) oldMap[String(oldArr[i][pk])] = { idx: i, val: oldArr[i] };

    var matchedOld = {};
    var result = [];

    // note
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

    // note

    var deleted = [];
    for (var i = 0; i < oldArr.length; i++) {
        if (!matchedOld[i]) deleted.push({ type: 'removed', oldVal: oldArr[i], origIdx: i });
    }

    // note

    if (deleted.length > 0) {
        // note
        var keyToResultIdx = {};
        for (var ri = 0; ri < result.length; ri++) {
            if (result[ri].type === 'matched') {
                keyToResultIdx[String(result[ri].oldVal[pk])] = ri;
            }
        }

        for (var di = deleted.length - 1; di >= 0; di--) {
            var d = deleted[di];
            // note
            var insertPos = result.length;
            for (var oi = d.origIdx + 1; oi < oldArr.length; oi++) {
                var nk = String(oldArr[oi][pk]);
                if (keyToResultIdx[nk] !== undefined) {
                    insertPos = keyToResultIdx[nk];
                    break;
                }
            }
            result.splice(insertPos, 0, d);
            // note

            for (var k in keyToResultIdx) {
                if (keyToResultIdx[k] >= insertPos) keyToResultIdx[k]++;
            }
        }
    }

    return result;
}

let _stringifyWeakCache = (typeof WeakMap !== 'undefined') ? new WeakMap() : null;
function resetStringifyCache() {
    _stringifyWeakCache = (typeof WeakMap !== 'undefined') ? new WeakMap() : null;
}

function cachedStringify(val) {
    if (val !== null && typeof val === 'object') {
        if (_stringifyWeakCache && _stringifyWeakCache.has(val)) return _stringifyWeakCache.get(val);
        var s = JSON.stringify(val);
        if (_stringifyWeakCache) _stringifyWeakCache.set(val, s);
        return s;
    }
    return JSON.stringify(val);
}

// note
function matchByContent(oldArr, newArr) {

    var oldUsed = new Array(oldArr.length);
    var newUsed = new Array(newArr.length);

    // note

    var oldStrs = oldArr.map(function(v) { return cachedStringify(v); });
    var newStrs = newArr.map(function(v) { return cachedStringify(v); });

    // note

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

    // note

    var unmatchedOld = [];
    var unmatchedNew = [];
    for (var i = 0; i < oldArr.length; i++) { if (!oldUsed[i]) unmatchedOld.push(i); }
    for (var i = 0; i < newArr.length; i++) { if (!newUsed[i]) unmatchedNew.push(i); }

    if (unmatchedOld.length > 0 && unmatchedNew.length > 0) {
        // note
        var SIM_PAIR_LIMIT = 10000;
        if (unmatchedOld.length * unmatchedNew.length <= SIM_PAIR_LIMIT) {
            // note

            function buildKeyCache(arr, indices) {
                var caches = [];
                for (var i = 0; i < indices.length; i++) {
                    var idx = indices[i];
                    var v = arr[idx];
                    if (v === null || typeof v !== 'object' || Array.isArray(v)) continue;
                    var keys = Object.keys(v);
                    var strs = {};
                    for (var k = 0; k < keys.length; k++) strs[keys[k]] = cachedStringify(v[keys[k]]);
                    caches.push({ idx: idx, keys: keys, strs: strs });
                }
                return caches;
            }
            var simObjOld = buildKeyCache(oldArr, unmatchedOld);
            var simObjNew = buildKeyCache(newArr, unmatchedNew);

            var simCandidates = [];
            for (var oi = 0; oi < simObjOld.length; oi++) {
                var cA = simObjOld[oi];
                for (var ni = 0; ni < simObjNew.length; ni++) {
                    if (newUsed[simObjNew[ni].idx]) continue;
                    var cB = simObjNew[ni];
                    // note

                    if (Math.min(cA.keys.length, cB.keys.length) / Math.max(cA.keys.length, cB.keys.length) < 0.3) continue;
                    // note

                    var allKeys = {};
                    for (var ki = 0; ki < cA.keys.length; ki++) allKeys[cA.keys[ki]] = true;
                    for (var ki = 0; ki < cB.keys.length; ki++) allKeys[cB.keys[ki]] = true;
                    var total = Object.keys(allKeys).length;
                    if (total === 0) continue;
                    var needed = Math.ceil(total * 0.3);
                    var same = 0, remaining = total, aborted = false;
                    for (var k in allKeys) {
                        if (cA.strs[k] !== undefined && cB.strs[k] !== undefined && cA.strs[k] === cB.strs[k]) same++;
                        remaining--;
                        if (same + remaining < needed) { aborted = true; break; }
                    }
                    if (aborted) continue;
                    var sim = same / total;
                    if (sim >= 0.3) simCandidates.push({ oldIdx: cA.idx, newIdx: cB.idx, sim: sim });
                }
            }

            // note
            simCandidates.sort(function(a, b) { return b.sim - a.sim; });
            for (var i = 0; i < simCandidates.length; i++) {
                var c = simCandidates[i];
                if (oldUsed[c.oldIdx] || newUsed[c.newIdx]) continue;
                oldUsed[c.oldIdx] = true;
                newUsed[c.newIdx] = true;
                pairs.push({ oldIdx: c.oldIdx, newIdx: c.newIdx, type: 'matched' });
            }
        }
    }

    // note
    // note

    var newIdxToPair = {};
    for (var i = 0; i < pairs.length; i++) {
        newIdxToPair[pairs[i].newIdx] = pairs[i];
    }

    var result = [];
    var deletedBeforeNew = {}; // oldIdx -> target newIdx insert position

    // note
    var unmatchedOldFinal = [];
    for (var i = 0; i < oldArr.length; i++) { if (!oldUsed[i]) unmatchedOldFinal.push(i); }

    // note
    var oldToNew = {};
    for (var i = 0; i < pairs.length; i++) {
        if (pairs[i].oldIdx !== undefined) oldToNew[pairs[i].oldIdx] = pairs[i].newIdx;
    }

    for (var di = 0; di < unmatchedOldFinal.length; di++) {
        var oIdx = unmatchedOldFinal[di];
        var insertBefore = newArr.length; // default append position
        for (var oi = oIdx + 1; oi < oldArr.length; oi++) {
            if (oldToNew[oi] !== undefined) { insertBefore = oldToNew[oi]; break; }
        }
        if (!deletedBeforeNew[insertBefore]) deletedBeforeNew[insertBefore] = [];
        deletedBeforeNew[insertBefore].push(oIdx);
    }

    // note
    for (var ni = 0; ni < newArr.length; ni++) {
        // note

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
    // note

    if (deletedBeforeNew[newArr.length]) {
        for (var d = 0; d < deletedBeforeNew[newArr.length].length; d++) {
            result.push({ type: 'removed', oldVal: oldArr[deletedBeforeNew[newArr.length][d]] });
        }
    }

    return result;
}

// note
function objectSimilarity(a, b) {
    var isArrA = Array.isArray(a), isArrB = Array.isArray(b);
    if (isArrA !== isArrB) return 0;
    if (isArrA) return cachedStringify(a) === cachedStringify(b) ? 1 : 0;

    var keysA = Object.keys(a), keysB = Object.keys(b);
    var allKeys = {};
    for (var i = 0; i < keysA.length; i++) allKeys[keysA[i]] = true;
    for (var i = 0; i < keysB.length; i++) allKeys[keysB[i]] = true;
    var total = Object.keys(allKeys).length;
    if (total === 0) return 1;

    var same = 0;
    for (var k in allKeys) {
        if (k in a && k in b && cachedStringify(a[k]) === cachedStringify(b[k])) same++;
    }
    return same / total;
}

// note
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

// note
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

    // note
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

    // note
    function walkValue(diff, oldVal, newVal, depth, keyStr, isLast) {
        const comma = isLast ? '' : ',';
        const prefix = keyStr !== null ? (ind(depth) + JSON.stringify(keyStr) + ': ') : ind(depth);

        // note

        if (diff.status === 'unchanged') {
            valueToLines(oldVal, depth, keyStr, isLast).forEach(l => push(l, l, 'unchanged', 'unchanged'));
            return;
        }

        // note

        if (diff.status === 'added') {
            valueToLines(newVal, depth, keyStr, isLast).forEach(l => push('', l, 'spacer', 'added'));
            return;
        }

        // note

        if (diff.status === 'removed') {
            valueToLines(oldVal, depth, keyStr, isLast).forEach(l => push(l, '', 'removed', 'spacer'));
            return;
        }

        // note

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

        // note

        if (diff.type === 'array') {
            push(prefix + '[', prefix + '[', 'unchanged', 'unchanged');
            diff.children.forEach((childDiff, idx) => {
                const isLastChild = idx === diff.children.length - 1;
                // note
                const oldItem = childDiff._oldVal;
                const newItem = childDiff._newVal;
                walkValue(childDiff, oldItem, newItem, depth + 1, null, isLastChild);
            });
            push(ind(depth) + ']' + comma, ind(depth) + ']' + comma, 'unchanged', 'unchanged');
            return;
        }

        // note
        // note
        const oldIsPrimitive = (oldVal === null || typeof oldVal !== 'object');
        const newIsPrimitive = (newVal === null || typeof newVal !== 'object');

        if (oldIsPrimitive && newIsPrimitive) {
            const oldText = prefix + JSON.stringify(oldVal) + comma;
            const newText = prefix + JSON.stringify(newVal) + comma;
            const lineIdx = push(oldText, newText, 'modified', 'modified');
            charDiffs[lineIdx] = computeInlineCharDiff(oldText, newText);
        } else {
            // note

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

    // note
    function fixCommas(lines) {
        for (let i = 0; i < lines.length; i++) {
            const cur = lines[i];
            if (!cur.trim()) continue;
            const trimmed = cur.trim();
            // note
            if (trimmed.endsWith('{') || trimmed.endsWith('[')) continue;

            // note

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

// note
function clearDiffMarks(options) {
    const opts = options || {};
    const fullReplace = !!opts.fullReplace;

    diffTextMarks.forEach(function(m) { m.clear(); });
    diffTextMarks = [];
    diffBookmarks.forEach(function(b) { b.clear(); });
    diffBookmarks = [];

    rightFoldRangesCache = null;
    rightFoldRangesDirty = true;
    diffAnnoStats = null;

    if (fullReplace) return;

    [editorLeft, editorRight].forEach(function(cm) {
        cm.operation(function() {
            for (var i = 0; i < cm.lineCount(); i++) {
                cm.removeLineClass(i, 'background');
                cm.removeLineClass(i, 'wrap');
                cm.setGutterMarker(i, 'diff-gutter', null);
            }
        });
    });
}

// note
function collectRightDiffBlocks(rightAnno) {
    var blocks = [];
    var blockStart = -1;
    for (var i = 0; i < rightAnno.length; i++) {
        var changed = rightAnno[i] !== 'unchanged';
        if (changed) {
            if (blockStart < 0) blockStart = i;
        } else if (blockStart >= 0) {
            blocks.push({ from: blockStart, to: i - 1 });
            blockStart = -1;
        }
    }
    if (blockStart >= 0) blocks.push({ from: blockStart, to: rightAnno.length - 1 });
    return blocks;
}

function applyRightBordersChunked(rightAnno, renderToken) {
    var blocks = collectRightDiffBlocks(rightAnno);
    if (!blocks.length) return Promise.resolve();

    var blockCursor = 0;
    var maxLinesPerFrame = 240;
    return new Promise(function(resolve) {
        function step() {
            if (renderToken !== diffRenderToken) {
                resolve();
                return;
            }

            var lineBudget = maxLinesPerFrame;
            editorRight.operation(function() {
                while (blockCursor < blocks.length && lineBudget > 0) {
                    var block = blocks[blockCursor];
                    var to = Math.min(block.to, block.from + lineBudget - 1);
                    for (var j = block.from; j <= to; j++) {
                        editorRight.addLineClass(j, 'wrap', 'diff-block-side');
                        if (j === block.from) editorRight.addLineClass(j, 'wrap', 'diff-block-top');
                        if (j === block.to) editorRight.addLineClass(j, 'wrap', 'diff-block-bottom');
                        lineBudget--;
                        if (lineBudget <= 0) break;
                    }
                    if (to >= block.to) {
                        blockCursor++;
                    } else {
                        blocks[blockCursor] = { from: to + 1, to: block.to };
                    }
                }
            });

            if (blockCursor < blocks.length) requestAnimationFrame(step);
            else resolve();
        }
        requestAnimationFrame(step);
    });
}

// note
function createGutterMarker(className) {
    var el = document.createElement('div');
    el.className = className;
    el.textContent = '\u25cf';
    return el;
}

function applyGutterMarkersChunked(leftAnno, rightAnno, renderToken) {
    var len = Math.max(leftAnno.length, rightAnno.length);
    if (!len) return Promise.resolve();

    var cursor = 0;
    var batchSize = 260;
    return new Promise(function(resolve) {
        function step() {
            if (renderToken !== diffRenderToken) {
                resolve();
                return;
            }

            var from = cursor;
            var to = Math.min(cursor + batchSize, len);

            editorLeft.operation(function() {
                for (var i = from; i < to; i++) {
                    var lt = leftAnno[i];
                    if (lt === 'removed' || lt === 'modified') {
                        editorLeft.setGutterMarker(i, 'diff-gutter', createGutterMarker('diff-gutter-dot diff-gutter-' + lt));
                    } else if (lt === 'spacer') {
                        editorLeft.setGutterMarker(i, 'diff-gutter', createGutterMarker('diff-gutter-dot diff-gutter-added'));
                    }
                }
            });

            editorRight.operation(function() {
                for (var i = from; i < to; i++) {
                    var rt = rightAnno[i];
                    if (rt === 'added' || rt === 'modified') {
                        editorRight.setGutterMarker(i, 'diff-gutter', createGutterMarker('diff-gutter-dot diff-gutter-' + rt));
                    } else if (rt === 'spacer') {
                        editorRight.setGutterMarker(i, 'diff-gutter', createGutterMarker('diff-gutter-dot diff-gutter-removed'));
                    }
                }
            });

            cursor = to;
            if (cursor < len) requestAnimationFrame(step);
            else resolve();
        }
        requestAnimationFrame(step);
    });
}

// note
function nextFrame() {
    return new Promise(function(resolve) {
        requestAnimationFrame(function() { resolve(); });
    });
}

function applyLineAnnotationsChunked(leftAnno, rightAnno, renderToken) {
    var len = Math.max(leftAnno.length, rightAnno.length);
    if (!len) return Promise.resolve();

    var cursor = 0;
    var batchSize = 320;
    return new Promise(function(resolve) {
        function step() {
            if (renderToken !== diffRenderToken) {
                resolve();
                return;
            }

            var from = cursor;
            var to = Math.min(cursor + batchSize, len);

            editorLeft.operation(function() {
                for (var i = from; i < to; i++) {
                    if (leftAnno[i] === 'modified') editorLeft.addLineClass(i, 'background', 'diff-line-modified');
                    else if (leftAnno[i] === 'removed') editorLeft.addLineClass(i, 'background', 'diff-line-removed');
                    else if (leftAnno[i] === 'spacer') editorLeft.addLineClass(i, 'background', 'diff-line-spacer');
                }
            });
            editorRight.operation(function() {
                for (var i = from; i < to; i++) {
                    if (rightAnno[i] === 'modified') editorRight.addLineClass(i, 'background', 'diff-line-modified');
                    else if (rightAnno[i] === 'added') editorRight.addLineClass(i, 'background', 'diff-line-added');
                    else if (rightAnno[i] === 'spacer') editorRight.addLineClass(i, 'background', 'diff-line-spacer');
                }
            });

            cursor = to;
            if (cursor < len) requestAnimationFrame(step);
            else resolve();
        }
        requestAnimationFrame(step);
    });
}

function applyCharDiffMarksChunked(charDiffs, renderToken) {
    const entries = Object.keys(charDiffs).map(function(k) {
        return { idx: parseInt(k, 10), cd: charDiffs[k] };
    });

    if (!entries.length) return Promise.resolve();

    entries.sort(function(a, b) { return a.idx - b.idx; });

    const batchSize = 180;
    let cursor = 0;

    return new Promise(function(resolve) {
        function step() {
            if (renderToken !== diffRenderToken) {
                resolve();
                return;
            }

            const from = cursor;
            const to = Math.min(cursor + batchSize, entries.length);

            editorLeft.operation(function() {
                for (var i = from; i < to; i++) {
                    var entry = entries[i];
                    var leftSeg = entry.cd.left;
                    if (leftSeg.from < leftSeg.to) {
                        diffTextMarks.push(editorLeft.markText(
                            { line: entry.idx, ch: leftSeg.from },
                            { line: entry.idx, ch: leftSeg.to },
                            { className: 'diff-char-old' }
                        ));
                    }
                }
            });

            editorRight.operation(function() {
                for (var i = from; i < to; i++) {
                    var entry = entries[i];
                    var rightSeg = entry.cd.right;
                    if (rightSeg.from < rightSeg.to) {
                        diffTextMarks.push(editorRight.markText(
                            { line: entry.idx, ch: rightSeg.from },
                            { line: entry.idx, ch: rightSeg.to },
                            { className: 'diff-char-new' }
                        ));
                    }
                }
            });

            cursor = to;
            if (cursor < entries.length) requestAnimationFrame(step);
            else resolve();
        }

        requestAnimationFrame(step);
    });
}

async function applyHeavyDiffDecorations(result, renderToken) {
    await nextFrame();
    if (renderToken !== diffRenderToken) return;
    await applyRightBordersChunked(result.rightAnno, renderToken);
    if (renderToken !== diffRenderToken) return;
    await applyGutterMarkersChunked(result.leftAnno, result.rightAnno, renderToken);
    if (renderToken !== diffRenderToken) return;
    await applyCharDiffMarksChunked(result.charDiffs, renderToken);
}

async function applyDiffToEditors(result, options) {
    const opts = options || {};
    const { leftLines, rightLines, leftAnno, rightAnno, charDiffs } = result;
    const renderToken = ++diffRenderToken;

    clearDiffMarks({ fullReplace: true });

    // note

    const diffGutters = ['CodeMirror-linenumbers', 'CodeMirror-foldgutter', 'diff-gutter'];
    editorLeft.setOption('gutters', diffGutters);
    editorRight.setOption('gutters', diffGutters);

    withAutoSavePaused(function() {
        editorLeft.setValue(leftLines.join('\n'));
        editorRight.setValue(rightLines.join('\n'));
    });

    await nextFrame();
    if (renderToken !== diffRenderToken) return null;
    await applyLineAnnotationsChunked(leftAnno, rightAnno, renderToken);
    if (renderToken !== diffRenderToken) return null;

    if (!opts.deferHeavyDecorations) {
        await applyHeavyDiffDecorations({ leftAnno: leftAnno, rightAnno: rightAnno, charDiffs: charDiffs }, renderToken);
    }

    return renderToken;
}

// note
function buildDiffAnnoStats(leftAnno, rightAnno) {
    var len = Math.max(leftAnno.length, rightAnno.length);
    var addedPrefix = new Array(len + 1);
    var removedPrefix = new Array(len + 1);
    var modifiedPrefix = new Array(len + 1);
    addedPrefix[0] = 0;
    removedPrefix[0] = 0;
    modifiedPrefix[0] = 0;

    for (var i = 0; i < len; i++) {
        var ra = rightAnno[i];
        var la = leftAnno[i];
        addedPrefix[i + 1] = addedPrefix[i] + (ra === 'added' ? 1 : 0);
        removedPrefix[i + 1] = removedPrefix[i] + ((ra === 'spacer' && la === 'removed') ? 1 : 0);
        modifiedPrefix[i + 1] = modifiedPrefix[i] + (ra === 'modified' ? 1 : 0);
    }

    return {
        length: len,
        addedPrefix: addedPrefix,
        removedPrefix: removedPrefix,
        modifiedPrefix: modifiedPrefix
    };
}

function queryRangeDiffTypes(stats, fromLine, toLine) {
    if (!stats || stats.length <= 0) return 0;
    var from = Math.max(0, fromLine);
    var to = Math.min(stats.length - 1, toLine);
    if (to < from) return 0;

    var end = to + 1;
    var types = 0;
    if (stats.addedPrefix[end] - stats.addedPrefix[from] > 0) types |= 1;
    if (stats.removedPrefix[end] - stats.removedPrefix[from] > 0) types |= 2;
    if (stats.modifiedPrefix[end] - stats.modifiedPrefix[from] > 0) types |= 4;
    return types;
}

function collectFoldRanges(cm) {
    var ranges = [];
    var lastLine = cm.lastLine();

    for (var line = cm.firstLine(); line <= lastLine;) {
        var lineText = cm.getLine(line) || '';
        var marks = cm.findMarksAt(CodeMirror.Pos(line, lineText.length));
        var foldRange = null;
        for (var i = 0; i < marks.length; i++) {
            var mk = marks[i];
            if (!mk.__isFold) continue;
            var found = mk.find();
            if (found && found.from && found.to && found.from.line === line) {
                foldRange = found;
                break;
            }
        }
        if (!foldRange) {
            line++;
            continue;
        }

        ranges.push({ line: foldRange.from.line, from: foldRange.from.line, to: foldRange.to.line });
        line = foldRange.to.line + 1;
    }

    return ranges;
}

let _badgeTimer = null;
function scheduleBadgeUpdate(markDirty) {
    if (markDirty !== false) rightFoldRangesDirty = true;
    if (_badgeTimer) clearTimeout(_badgeTimer);
    _badgeTimer = setTimeout(updateDiffBadges, 45);
}

function updateDiffBadges() {
    _badgeTimer = null;
    if (!isDiffMode) return;

    diffBookmarks.forEach(function(b) { b.clear(); });
    diffBookmarks = [];

    const cm = editorRight;
    const rightAnno = window._diffRightAnno;
    const leftAnno = window._diffLeftAnno;
    if (!rightAnno || !leftAnno) return;

    if (!diffAnnoStats || diffAnnoStats.length !== rightAnno.length) {
        diffAnnoStats = buildDiffAnnoStats(leftAnno, rightAnno);
    }

    if (rightFoldRangesDirty || !rightFoldRangesCache) {
        rightFoldRangesCache = collectFoldRanges(cm);
        rightFoldRangesDirty = false;
    }
    var foldLines = rightFoldRangesCache;
    if (!foldLines || !foldLines.length) return;

    cm.operation(function() {
        for (var fi = 0; fi < foldLines.length; fi++) {
            var fl = foldLines[fi];
            var types = queryRangeDiffTypes(diffAnnoStats, fl.from, fl.to);
            if (types === 0) continue;

            var badge = document.createElement('span');
            badge.className = 'diff-badge-container';
            if (types & 1) { var d1 = document.createElement('span'); d1.className = 'diff-badge-dot diff-badge-added'; badge.appendChild(d1); }
            if (types & 2) { var d2 = document.createElement('span'); d2.className = 'diff-badge-dot diff-badge-removed'; badge.appendChild(d2); }
            if (types & 4) { var d3 = document.createElement('span'); d3.className = 'diff-badge-dot diff-badge-modified'; badge.appendChild(d3); }

            var lineText = cm.getLine(fl.line) || '';
            var bm = cm.setBookmark(CodeMirror.Pos(fl.line, lineText.length), { widget: badge, insertLeft: true });
            diffBookmarks.push(bm);
        }
    });
}

// note
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

function setCompareLoading(loading) {
    const btn = document.getElementById('action-btn');
    if (!btn) return;
    if (loading) {
        btn.dataset.prevText = btn.textContent;
        btn.textContent = '对比中...';
        btn.disabled = true;
        btn.style.opacity = '0.75';
        btn.style.cursor = 'wait';
    } else {
        btn.textContent = btn.dataset.prevText || '执行比对';
        btn.disabled = false;
        btn.style.opacity = '';
        btn.style.cursor = '';
    }
}

function createWorkerError(error) {
    if (!error || typeof error !== 'object') return { side: 'unknown', code: 'unknown', message: 'Worker 计算失败' };
    return {
        side: error.side || 'unknown',
        code: error.code || 'unknown',
        message: error.message || 'Worker 计算失败'
    };
}

function ensureCompareWorker() {
    if (!window.Worker) return null;
    if (compareWorker) return compareWorker;

    try {
        compareWorker = new Worker('../js/json-diff-worker.js');
    } catch (e) {
        compareWorker = null;
        return null;
    }
    compareWorker.addEventListener('message', function(e) {
        const msg = e.data || {};
        const pending = pendingCompareRequests.get(msg.requestId);
        if (!pending) return;
        pendingCompareRequests.delete(msg.requestId);
        if (msg.ok) pending.resolve(msg.result);
        else pending.reject(createWorkerError(msg.error));
    });
    compareWorker.addEventListener('error', function(err) {
        pendingCompareRequests.forEach(function(pending, reqId) {
            pending.reject(createWorkerError({
                side: 'unknown',
                code: 'worker_runtime',
                message: (err && err.message) ? err.message : 'Worker 运行异常'
            }));
            pendingCompareRequests.delete(reqId);
        });
    });

    return compareWorker;
}

function requestCompareInWorker(leftText, rightText, tabSize) {
    const worker = ensureCompareWorker();
    if (!worker) {
        return Promise.reject(createWorkerError({
            side: 'unknown',
            code: 'worker_unavailable',
            message: '当前环境不支持 Web Worker'
        }));
    }

    const requestId = ++compareRequestSeq;
    return new Promise(function(resolve, reject) {
        pendingCompareRequests.set(requestId, { resolve, reject });
        worker.postMessage({
            requestId: requestId,
            leftText: leftText,
            rightText: rightText,
            tabSize: tabSize
        });
    });
}

function formatJSONAsync(editor) {
    return new Promise(function(resolve) {
        formatJSON(editor, function(ok) { resolve(!!ok); });
    });
}

async function smartFormatThenCompareViaWorker(runSeq) {
    const leftOk = await formatJSONAsync(editorLeft);
    if (!leftOk || runSeq !== activeCompareRunSeq) return false;

    const rightOk = await formatJSONAsync(editorRight);
    if (!rightOk || runSeq !== activeCompareRunSeq) return false;

    const leftText = editorLeft.getValue().trim();
    const rightText = editorRight.getValue().trim();
    if (!leftText || !rightText) return false;

    setCompareLoading(true);
    try {
        const result = await requestCompareInWorker(leftText, rightText, currentTabSize);
        if (runSeq !== activeCompareRunSeq) return false;
        await applyCompareResult(result, runSeq);
        return true;
    } catch (err) {
        const message = (err && err.message) ? err.message : '未知错误';
        alert('对比失败：\n' + message);
        return false;
    } finally {
        if (runSeq === activeCompareRunSeq) setCompareLoading(false);
    }
}

// note
async function runCompare() {
    const leftText = editorLeft.getValue().trim();
    const rightText = editorRight.getValue().trim();

    if (!leftText || !rightText) {
        alert('请在两侧面板中分别粘贴需要比对的 JSON 数据');
        return;
    }

    const runSeq = ++activeCompareRunSeq;
    setCompareLoading(true);

    try {
        const result = await requestCompareInWorker(leftText, rightText, currentTabSize);
        if (runSeq !== activeCompareRunSeq) return;
        await applyCompareResult(result, runSeq);
    } catch (err) {
        if (runSeq !== activeCompareRunSeq) return;

        // note

        if (err && err.code === 'parse_error') {
            setCompareLoading(false);
            await smartFormatThenCompareViaWorker(runSeq);
            return;
        }

        // note

        if (err && err.code === 'worker_unavailable') {
            if (!workerUnavailableNotified) {
                workerUnavailableNotified = true;
                alert('当前环境不支持后台线程加速，已切换为兼容模式（性能较低）。建议通过 http/https 方式打开页面。');
            }
            try {
                const leftObj = JSON.parse(leftText);
                const rightObj = JSON.parse(rightText);
                await executeCompare(leftObj, rightObj, runSeq);
                return;
            } catch (parseErr) {
                await smartFormatThenCompareViaWorker(runSeq);
                return;
            }
        }

        const message = (err && err.message) ? err.message : '未知错误';
        alert('对比失败：\n' + message);
    } finally {
        if (runSeq === activeCompareRunSeq) setCompareLoading(false);
    }
}

function tryParse(text) {
    try { return { ok: true, val: JSON.parse(text) }; }
    catch(e) { return { ok: false, err: e.message }; }
}

// note
function detectJsonIssues(text) {
    var fixes = [];
    var positions = []; // {line, ch, len, desc}
    var fixed = text;

    // note
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

    // note
    var bomRe = /[\uFEFF\u200B\u200C\u200D\u00A0]/g;
    var m;
    while ((m = bomRe.exec(text)) !== null) {
        var p = posOf(m.index);
        var desc = m[0] === '\uFEFF' ? 'BOM标记' : (m[0] === '\u00A0' ? '不间断空格' : '零宽字符');
        positions.push({ line: p.line, ch: p.ch, len: 1, desc: desc });
    }
    fixes.push({ name: 'BOM/不可见字符', count: positions.length });
    fixed = fixed.replace(bomRe, '');

    // note

    var cnPuncMap = {
        '\uff0c': ',', '\uff1a': ':', '\uff1b': ';',
        '\u201c': '"', '\u201d': '"', '\u2018': "'", '\u2019': "'",
        '\u3000': ' ', '\uff08': '(', '\uff09': ')',
        '\uff3b': '[', '\uff3d': ']', '\uff5b': '{', '\uff5d': '}',
        '\u3010': '[', '\u3011': ']'
    };
    var cnKeys = Object.keys(cnPuncMap);
    var cnRe = new RegExp('[' + cnKeys.join('') + ']', 'g');
    var cnCount = 0;
    // note
    while ((m = cnRe.exec(text)) !== null) {
        var p = posOf(m.index);
        positions.push({ line: p.line, ch: p.ch, len: 1, desc: '中文标点 ' + m[0] + ' -> ' + cnPuncMap[m[0]] });
        cnCount++;
    }
    if (cnCount > 0) fixes.push({ name: '中文标点', count: cnCount });
    fixed = fixed.replace(cnRe, function(ch) { return cnPuncMap[ch] || ch; });

    // note
    var working = fixed;

    // note

    var STR_SKIP = '"(?:[^"\\\\]|\\\\.)*"';

    // note

    var singleQuoteCount = 0;
    working = working.replace(new RegExp(STR_SKIP + "|'((?:[^'\\\\]|\\\\.)*)'" , 'g'), function(match, inner) {
        if (match[0] === '"') return match;
        singleQuoteCount++;
        return '"' + inner.replace(/"/g, '\\"') + '"';
    });
    if (singleQuoteCount > 0) fixes.push({ name: '单引号→双引号', count: singleQuoteCount });

    // note

    var commentCount = 0;
    working = working.replace(new RegExp(STR_SKIP + '|\\/\\/[^\\n]*', 'g'), function(match) {
        if (match[0] === '"') return match;
        commentCount++; return '';
    });
    working = working.replace(new RegExp(STR_SKIP + '|\\/\\*[\\s\\S]*?\\*\\/', 'g'), function(match) {
        if (match[0] === '"') return match;
        commentCount++; return '';
    });
    if (commentCount > 0) fixes.push({ name: '注释', count: commentCount });

    // note

    var trailingCount = 0;
    working = working.replace(new RegExp(STR_SKIP + '|,(\\s*[}\\]])', 'g'), function(match, after) {
        if (match[0] === '"') return match;
        trailingCount++; return after;
    });
    if (trailingCount > 0) fixes.push({ name: '尾部逗号', count: trailingCount });

    // note

    var unquotedCount = 0;
    working = working.replace(new RegExp(STR_SKIP + '|([{,]\\s*)([a-zA-Z_$][\\w$]*)(\\s*:)', 'g'), function(match, before, key, after) {
        if (match[0] === '"') return match;
        unquotedCount++;
        return before + '"' + key + '"' + after;
    });
    if (unquotedCount > 0) fixes.push({ name: '无引号键名', count: unquotedCount });

    fixed = working;

    // note
    // note
    var missingCommaCount = 0;
    var origLines = text.split('\n');
    for (var li = 0; li < origLines.length - 1; li++) {
        var curLine = origLines[li].trimEnd();
        var nextLine = origLines[li + 1].trim();
        if (!curLine || !nextLine) continue;

        var curEnds = curLine[curLine.length - 1];
        var nextStarts = nextLine[0];

        // note

        var noCommaEnds = (curEnds === '"' || curEnds === '}' || curEnds === ']' ||
                           curEnds === 'e' || curEnds === 'l' || // true/false/null
                           /[0-9]/.test(curEnds));
        var validNextStarts = (nextStarts === '"' || nextStarts === '{' || nextStarts === '[' ||
                                nextStarts === 't' || nextStarts === 'f' || nextStarts === 'n' ||
                                /[0-9\-]/.test(nextStarts));

        if (noCommaEnds && validNextStarts) {
            // note

            if (curEnds === '{' || curEnds === '[' || curEnds === ':') continue;
            // note

            if (nextStarts === '}' || nextStarts === ']') continue;

            // note
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

    // note
    fixes = fixes.filter(function(f) { return f.count > 0; });


    return { fixes: fixes, positions: positions, fixed: fixed };
}

// note
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

async function applyCompareResult(result, runSeq) {
    if (runSeq !== undefined && runSeq !== activeCompareRunSeq) return;

    // note

    window._diffRightAnno = result.rightAnno;
    window._diffLeftAnno = result.leftAnno;
    rightFoldRangesCache = null;
    rightFoldRangesDirty = true;

    // note
    isDiffMode = true;
    const renderToken = await applyDiffToEditors(result, { deferHeavyDecorations: true });
    if (renderToken === null) return;
    if (runSeq !== undefined && runSeq !== activeCompareRunSeq) return;

    // note
    editorLeft.setOption('foldGutter', { rangeFinder: diffBracketFold });
    editorRight.setOption('foldGutter', { rangeFinder: diffBracketFold });

    // note
    enableDiffSync();

    // note

    await foldToLevel(editorLeft, 1, { freshDoc: true, chunked: true, chunkSize: 120 });
    if (runSeq !== undefined && runSeq !== activeCompareRunSeq) return;
    await foldToLevel(editorRight, 1, { freshDoc: true, chunked: true, chunkSize: 120 });
    if (runSeq !== undefined && runSeq !== activeCompareRunSeq) return;

    // note
    scheduleBadgeUpdate(true);
    void applyHeavyDiffDecorations(result, renderToken);
}

async function executeCompare(leftObj, rightObj, runSeq) {
    resetStringifyCache();
    // note

    const oldSorted = sortObjectKeys(leftObj);
    const newSorted = sortObjectKeys(rightObj);

    // note

    const diffTree = deepCompare(oldSorted, newSorted);

    // note

    const result = generateAlignedDiff(oldSorted, newSorted, diffTree, currentTabSize);
    await applyCompareResult(result, runSeq);
}
