/* eslint-disable no-redeclare */
// JSON diff worker
// Protocol:
// request: { requestId, leftText, rightText, tabSize }
// response success: { requestId, ok: true, result }
// response error: { requestId, ok: false, error: { side, code, message } }

(function () {
    'use strict';

    var objectStringifyCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;

    function stableStringify(val) {
        if (val !== null && typeof val === 'object') {
            if (objectStringifyCache && objectStringifyCache.has(val)) return objectStringifyCache.get(val);
            var s = JSON.stringify(val);
            if (objectStringifyCache) objectStringifyCache.set(val, s);
            return s;
        }
        return JSON.stringify(val);
    }

    function sortObjectKeys(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) return obj.map(sortObjectKeys);
        var sorted = {};
        Object.keys(obj).sort(function (a, b) { return a.localeCompare(b); }).forEach(function (key) {
            sorted[key] = sortObjectKeys(obj[key]);
        });
        return sorted;
    }

    function deepCompare(oldVal, newVal) {
        if (oldVal === undefined && newVal === undefined) return { status: 'unchanged' };
        if (oldVal === undefined) return { status: 'added', newValue: newVal };
        if (newVal === undefined) return { status: 'removed', oldValue: oldVal };

        if (oldVal === null && newVal === null) return { status: 'unchanged' };
        if (oldVal === null || newVal === null) return { status: 'modified', oldValue: oldVal, newValue: newVal };

        var oldIsArr = Array.isArray(oldVal);
        var newIsArr = Array.isArray(newVal);
        if (typeof oldVal !== typeof newVal || oldIsArr !== newIsArr) {
            return { status: 'modified', oldValue: oldVal, newValue: newVal };
        }

        if (oldIsArr) return deepCompareArrays(oldVal, newVal);
        if (typeof oldVal === 'object') return deepCompareObjects(oldVal, newVal);

        if (oldVal === newVal) return { status: 'unchanged' };
        return { status: 'modified', oldValue: oldVal, newValue: newVal };
    }

    function deepCompareObjects(oldObj, newObj) {
        var allKeys = new Set(Object.keys(oldObj).concat(Object.keys(newObj)));
        var sortedKeys = Array.from(allKeys).sort(function (a, b) { return a.localeCompare(b); });
        var children = {};
        var hasChanges = false;

        for (var i = 0; i < sortedKeys.length; i++) {
            var key = sortedKeys[i];
            var inOld = key in oldObj;
            var inNew = key in newObj;
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

        return { type: 'object', status: hasChanges ? 'modified' : 'unchanged', children: children };
    }

    function deepCompareArrays(oldArr, newArr) {
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
                child = deepCompare(p.oldVal, p.newVal);
                child._oldVal = p.oldVal;
                child._newVal = p.newVal;
                if (child.status !== 'unchanged') hasChanges = true;
            }
            children.push(child);
        }

        return { type: 'array', status: hasChanges ? 'modified' : 'unchanged', children: children };
    }

    function matchArrayElements(oldArr, newArr) {
        var oldLen = oldArr.length;
        var newLen = newArr.length;
        if (oldLen === 0 && newLen === 0) return [];
        if (oldLen === 0) return newArr.map(function (v) { return { type: 'added', newVal: v }; });
        if (newLen === 0) return oldArr.map(function (v) { return { type: 'removed', oldVal: v }; });

        var allOldObj = true;
        var allNewObj = true;
        for (var i = 0; i < oldLen; i++) {
            if (oldArr[i] === null || typeof oldArr[i] !== 'object' || Array.isArray(oldArr[i])) {
                allOldObj = false;
                break;
            }
        }
        for (var j = 0; j < newLen; j++) {
            if (newArr[j] === null || typeof newArr[j] !== 'object' || Array.isArray(newArr[j])) {
                allNewObj = false;
                break;
            }
        }

        if (allOldObj && allNewObj) {
            var pk = detectPrimaryKey(oldArr, newArr);
            if (pk) return matchByPrimaryKey(oldArr, newArr, pk);
        }

        return matchByContent(oldArr, newArr);
    }

    function detectPrimaryKey(oldArr, newArr) {
        var candidateKeys = null;
        var all = oldArr.concat(newArr);
        for (var i = 0; i < all.length; i++) {
            var keys = Object.keys(all[i]);
            if (candidateKeys === null) {
                candidateKeys = {};
                for (var j = 0; j < keys.length; j++) candidateKeys[keys[j]] = true;
            } else {
                var next = {};
                for (var k = 0; k < keys.length; k++) {
                    if (candidateKeys[keys[k]]) next[keys[k]] = true;
                }
                candidateKeys = next;
            }
            if (Object.keys(candidateKeys).length === 0) return null;
        }

        var preferred = ['id', '_id', 'Id', 'ID', 'uuid', 'key', 'code', 'name'];
        var remaining = Object.keys(candidateKeys).filter(function (k) { return preferred.indexOf(k) === -1; });
        var ordered = preferred.filter(function (k) { return candidateKeys[k]; }).concat(remaining);

        for (var ci = 0; ci < ordered.length; ci++) {
            var field = ordered[ci];
            var oldVals = {};
            var newVals = {};
            var valid = true;

            for (var oi = 0; oi < oldArr.length; oi++) {
                var ov = oldArr[oi][field];
                if (ov === null || typeof ov === 'object') { valid = false; break; }
                var osv = String(ov);
                if (oldVals[osv]) { valid = false; break; }
                oldVals[osv] = true;
            }
            if (!valid) continue;

            for (var ni = 0; ni < newArr.length; ni++) {
                var nv = newArr[ni][field];
                if (nv === null || typeof nv === 'object') { valid = false; break; }
                var nsv = String(nv);
                if (newVals[nsv]) { valid = false; break; }
                newVals[nsv] = true;
            }
            if (valid) return field;
        }

        return null;
    }

    function matchByPrimaryKey(oldArr, newArr, pk) {
        var oldMap = {};
        for (var i = 0; i < oldArr.length; i++) oldMap[String(oldArr[i][pk])] = { idx: i, val: oldArr[i] };

        var matchedOld = {};
        var result = [];

        for (var j = 0; j < newArr.length; j++) {
            var key = String(newArr[j][pk]);
            if (oldMap[key]) {
                var o = oldMap[key];
                matchedOld[o.idx] = true;
                result.push({ type: 'matched', oldVal: o.val, newVal: newArr[j] });
            } else {
                result.push({ type: 'added', newVal: newArr[j] });
            }
        }

        var deleted = [];
        for (var d = 0; d < oldArr.length; d++) {
            if (!matchedOld[d]) deleted.push({ type: 'removed', oldVal: oldArr[d], origIdx: d });
        }

        if (deleted.length > 0) {
            var keyToResultIdx = {};
            for (var ri = 0; ri < result.length; ri++) {
                if (result[ri].type === 'matched') keyToResultIdx[String(result[ri].oldVal[pk])] = ri;
            }

            for (var di = deleted.length - 1; di >= 0; di--) {
                var del = deleted[di];
                var insertPos = result.length;
                for (var oi = del.origIdx + 1; oi < oldArr.length; oi++) {
                    var nk = String(oldArr[oi][pk]);
                    if (keyToResultIdx[nk] !== undefined) {
                        insertPos = keyToResultIdx[nk];
                        break;
                    }
                }
                result.splice(insertPos, 0, del);
                for (var mapKey in keyToResultIdx) {
                    if (keyToResultIdx[mapKey] >= insertPos) keyToResultIdx[mapKey]++;
                }
            }
        }

        return result;
    }

    function matchByContent(oldArr, newArr) {
        var oldUsed = new Array(oldArr.length);
        var newUsed = new Array(newArr.length);

        var oldStrs = oldArr.map(function (v) { return stableStringify(v); });
        var newStrs = newArr.map(function (v) { return stableStringify(v); });

        var newBuckets = {};
        for (var i = 0; i < newArr.length; i++) {
            var ns = newStrs[i];
            if (!newBuckets[ns]) newBuckets[ns] = [];
            newBuckets[ns].push(i);
        }

        var pairs = [];

        for (var oi = 0; oi < oldArr.length; oi++) {
            var os = oldStrs[oi];
            if (newBuckets[os] && newBuckets[os].length > 0) {
                var ni = newBuckets[os].shift();
                oldUsed[oi] = true;
                newUsed[ni] = true;
                pairs.push({ oldIdx: oi, newIdx: ni, type: 'unchanged' });
            }
        }

        var unmatchedOld = [];
        var unmatchedNew = [];
        for (var a = 0; a < oldArr.length; a++) if (!oldUsed[a]) unmatchedOld.push(a);
        for (var b = 0; b < newArr.length; b++) if (!newUsed[b]) unmatchedNew.push(b);

        if (unmatchedOld.length > 0 && unmatchedNew.length > 0) {
            var SIM_PAIR_LIMIT = 10000;
            if (unmatchedOld.length * unmatchedNew.length <= SIM_PAIR_LIMIT) {
                function buildKeyCache(arr, indices) {
                    var caches = [];
                    for (var i = 0; i < indices.length; i++) {
                        var idx = indices[i];
                        var v = arr[idx];
                        if (v === null || typeof v !== 'object' || Array.isArray(v)) continue;
                        var keys = Object.keys(v);
                        var strs = {};
                        for (var k = 0; k < keys.length; k++) strs[keys[k]] = stableStringify(v[keys[k]]);
                        caches.push({ idx: idx, keys: keys, strs: strs });
                    }
                    return caches;
                }

                var simObjOld = buildKeyCache(oldArr, unmatchedOld);
                var simObjNew = buildKeyCache(newArr, unmatchedNew);

                var simCandidates = [];
                for (var x = 0; x < simObjOld.length; x++) {
                    var cA = simObjOld[x];
                    for (var y = 0; y < simObjNew.length; y++) {
                        if (newUsed[simObjNew[y].idx]) continue;
                        var cB = simObjNew[y];
                        if (Math.min(cA.keys.length, cB.keys.length) / Math.max(cA.keys.length, cB.keys.length) < 0.3) continue;

                        var allKeys = {};
                        for (var k1 = 0; k1 < cA.keys.length; k1++) allKeys[cA.keys[k1]] = true;
                        for (var k2 = 0; k2 < cB.keys.length; k2++) allKeys[cB.keys[k2]] = true;
                        var total = Object.keys(allKeys).length;
                        if (total === 0) continue;

                        var needed = Math.ceil(total * 0.3);
                        var same = 0;
                        var remaining = total;
                        var aborted = false;
                        for (var key in allKeys) {
                            if (cA.strs[key] !== undefined && cB.strs[key] !== undefined && cA.strs[key] === cB.strs[key]) same++;
                            remaining--;
                            if (same + remaining < needed) {
                                aborted = true;
                                break;
                            }
                        }
                        if (aborted) continue;

                        var sim = same / total;
                        if (sim >= 0.3) simCandidates.push({ oldIdx: cA.idx, newIdx: cB.idx, sim: sim });
                    }
                }

                simCandidates.sort(function (m, n) { return n.sim - m.sim; });
                for (var s = 0; s < simCandidates.length; s++) {
                    var cand = simCandidates[s];
                    if (oldUsed[cand.oldIdx] || newUsed[cand.newIdx]) continue;
                    oldUsed[cand.oldIdx] = true;
                    newUsed[cand.newIdx] = true;
                    pairs.push({ oldIdx: cand.oldIdx, newIdx: cand.newIdx, type: 'matched' });
                }
            }
        }

        var newIdxToPair = {};
        for (var pi = 0; pi < pairs.length; pi++) newIdxToPair[pairs[pi].newIdx] = pairs[pi];

        var result = [];
        var deletedBeforeNew = {};

        var unmatchedOldFinal = [];
        for (var ou = 0; ou < oldArr.length; ou++) if (!oldUsed[ou]) unmatchedOldFinal.push(ou);

        var oldToNew = {};
        for (var pn = 0; pn < pairs.length; pn++) {
            if (pairs[pn].oldIdx !== undefined) oldToNew[pairs[pn].oldIdx] = pairs[pn].newIdx;
        }

        for (var di = 0; di < unmatchedOldFinal.length; di++) {
            var oIdx = unmatchedOldFinal[di];
            var insertBefore = newArr.length;
            for (var oi2 = oIdx + 1; oi2 < oldArr.length; oi2++) {
                if (oldToNew[oi2] !== undefined) {
                    insertBefore = oldToNew[oi2];
                    break;
                }
            }
            if (!deletedBeforeNew[insertBefore]) deletedBeforeNew[insertBefore] = [];
            deletedBeforeNew[insertBefore].push(oIdx);
        }

        for (var ni2 = 0; ni2 < newArr.length; ni2++) {
            if (deletedBeforeNew[ni2]) {
                for (var d2 = 0; d2 < deletedBeforeNew[ni2].length; d2++) {
                    result.push({ type: 'removed', oldVal: oldArr[deletedBeforeNew[ni2][d2]] });
                }
            }

            var pair = newIdxToPair[ni2];
            if (pair) {
                if (pair.type === 'unchanged') result.push({ type: 'unchanged', oldVal: oldArr[pair.oldIdx], newVal: newArr[ni2] });
                else result.push({ type: 'matched', oldVal: oldArr[pair.oldIdx], newVal: newArr[ni2] });
            } else {
                result.push({ type: 'added', newVal: newArr[ni2] });
            }
        }

        if (deletedBeforeNew[newArr.length]) {
            for (var tail = 0; tail < deletedBeforeNew[newArr.length].length; tail++) {
                result.push({ type: 'removed', oldVal: oldArr[deletedBeforeNew[newArr.length][tail]] });
            }
        }

        return result;
    }

    function computeInlineCharDiff(oldLine, newLine) {
        var prefixLen = 0;
        var minLen = Math.min(oldLine.length, newLine.length);
        while (prefixLen < minLen && oldLine[prefixLen] === newLine[prefixLen]) prefixLen++;

        var suffixLen = 0;
        while (suffixLen < (minLen - prefixLen) &&
            oldLine[oldLine.length - 1 - suffixLen] === newLine[newLine.length - 1 - suffixLen]) {
            suffixLen++;
        }

        return {
            left: { from: prefixLen, to: oldLine.length - suffixLen },
            right: { from: prefixLen, to: newLine.length - suffixLen }
        };
    }

    function generateAlignedDiff(oldSorted, newSorted, diffTree, tabSize) {
        var leftLines = [];
        var rightLines = [];
        var leftAnno = [];
        var rightAnno = [];
        var charDiffs = {};

        function ind(d) { return ' '.repeat(d * tabSize); }

        function push(lt, rt, la, ra) {
            var idx = leftLines.length;
            leftLines.push(lt);
            rightLines.push(rt);
            leftAnno.push(la);
            rightAnno.push(ra);
            return idx;
        }

        function valueToLines(val, depth, keyStr, isLast) {
            var comma = isLast ? '' : ',';
            var prefix = keyStr !== null ? (ind(depth) + JSON.stringify(keyStr) + ': ') : ind(depth);

            if (val === null || typeof val !== 'object') return [prefix + JSON.stringify(val) + comma];

            var isArr = Array.isArray(val);
            var open = isArr ? '[' : '{';
            var close = isArr ? ']' : '}';

            if ((isArr && val.length === 0) || (!isArr && Object.keys(val).length === 0)) {
                return [prefix + open + close + comma];
            }

            var lines = [prefix + open];
            if (isArr) {
                for (var i = 0; i < val.length; i++) {
                    lines.push.apply(lines, valueToLines(val[i], depth + 1, null, i === val.length - 1));
                }
            } else {
                var keys = Object.keys(val);
                for (var ki = 0; ki < keys.length; ki++) {
                    var k = keys[ki];
                    lines.push.apply(lines, valueToLines(val[k], depth + 1, k, ki === keys.length - 1));
                }
            }
            lines.push(ind(depth) + close + comma);
            return lines;
        }

        function walkValue(diff, oldVal, newVal, depth, keyStr, isLast) {
            var comma = isLast ? '' : ',';
            var prefix = keyStr !== null ? (ind(depth) + JSON.stringify(keyStr) + ': ') : ind(depth);

            if (diff.status === 'unchanged') {
                var sameLines = valueToLines(oldVal, depth, keyStr, isLast);
                for (var s = 0; s < sameLines.length; s++) push(sameLines[s], sameLines[s], 'unchanged', 'unchanged');
                return;
            }

            if (diff.status === 'added') {
                var addLines = valueToLines(newVal, depth, keyStr, isLast);
                for (var a = 0; a < addLines.length; a++) push('', addLines[a], 'spacer', 'added');
                return;
            }

            if (diff.status === 'removed') {
                var delLines = valueToLines(oldVal, depth, keyStr, isLast);
                for (var r = 0; r < delLines.length; r++) push(delLines[r], '', 'removed', 'spacer');
                return;
            }

            if (diff.type === 'object') {
                push(prefix + '{', prefix + '{', 'unchanged', 'unchanged');
                var childKeys = Object.keys(diff.children);
                for (var c = 0; c < childKeys.length; c++) {
                    var childKey = childKeys[c];
                    var childDiff = diff.children[childKey];
                    walkValue(childDiff, oldVal ? oldVal[childKey] : undefined, newVal ? newVal[childKey] : undefined, depth + 1, childKey, c === childKeys.length - 1);
                }
                push(ind(depth) + '}' + comma, ind(depth) + '}' + comma, 'unchanged', 'unchanged');
                return;
            }

            if (diff.type === 'array') {
                push(prefix + '[', prefix + '[', 'unchanged', 'unchanged');
                for (var ai = 0; ai < diff.children.length; ai++) {
                    var child = diff.children[ai];
                    walkValue(child, child._oldVal, child._newVal, depth + 1, null, ai === diff.children.length - 1);
                }
                push(ind(depth) + ']' + comma, ind(depth) + ']' + comma, 'unchanged', 'unchanged');
                return;
            }

            var oldIsPrimitive = (oldVal === null || typeof oldVal !== 'object');
            var newIsPrimitive = (newVal === null || typeof newVal !== 'object');

            if (oldIsPrimitive && newIsPrimitive) {
                var oldText = prefix + JSON.stringify(oldVal) + comma;
                var newText = prefix + JSON.stringify(newVal) + comma;
                var lineIdx = push(oldText, newText, 'modified', 'modified');
                charDiffs[lineIdx] = computeInlineCharDiff(oldText, newText);
            } else {
                var oldTypeLines = valueToLines(oldVal, depth, keyStr, isLast);
                var newTypeLines = valueToLines(newVal, depth, keyStr, isLast);
                var maxLen = Math.max(oldTypeLines.length, newTypeLines.length);
                for (var ti = 0; ti < maxLen; ti++) {
                    push(
                        ti < oldTypeLines.length ? oldTypeLines[ti] : '',
                        ti < newTypeLines.length ? newTypeLines[ti] : '',
                        ti < oldTypeLines.length ? 'modified' : 'spacer',
                        ti < newTypeLines.length ? 'modified' : 'spacer'
                    );
                }
            }
        }

        walkValue(diffTree, oldSorted, newSorted, 0, null, true);

        function fixCommas(lines) {
            for (var i = 0; i < lines.length; i++) {
                var cur = lines[i];
                if (!cur.trim()) continue;
                var trimmed = cur.trim();
                if (trimmed.endsWith('{') || trimmed.endsWith('[')) continue;

                var nextTrimmed = '';
                for (var j = i + 1; j < lines.length; j++) {
                    if (lines[j].trim()) { nextTrimmed = lines[j].trim(); break; }
                }

                var beforeClose = (nextTrimmed.length > 0 && (nextTrimmed[0] === '}' || nextTrimmed[0] === ']'));
                var needsComma = (nextTrimmed.length > 0 && !beforeClose);
                var hasComma = cur.trimEnd().endsWith(',');

                if (needsComma && !hasComma) lines[i] = cur.trimEnd() + ',';
                else if (!needsComma && hasComma) {
                    var idx = cur.lastIndexOf(',');
                    lines[i] = cur.substring(0, idx);
                }
            }
        }

        fixCommas(leftLines);
        fixCommas(rightLines);

        return { leftLines: leftLines, rightLines: rightLines, leftAnno: leftAnno, rightAnno: rightAnno, charDiffs: charDiffs };
    }

    self.addEventListener('message', function (e) {
        var msg = e.data || {};
        var requestId = msg.requestId;
        var leftText = (typeof msg.leftText === 'string') ? msg.leftText.trim() : '';
        var rightText = (typeof msg.rightText === 'string') ? msg.rightText.trim() : '';
        var tabSize = Number.isFinite(msg.tabSize) ? Math.max(1, Math.min(8, Math.floor(msg.tabSize))) : 4;

        var leftObj;
        var rightObj;

        try {
            leftObj = JSON.parse(leftText);
        } catch (errLeft) {
            self.postMessage({
                requestId: requestId,
                ok: false,
                error: {
                    side: 'left',
                    code: 'parse_error',
                    message: errLeft && errLeft.message ? errLeft.message : '左侧 JSON 解析失败'
                }
            });
            return;
        }

        try {
            rightObj = JSON.parse(rightText);
        } catch (errRight) {
            self.postMessage({
                requestId: requestId,
                ok: false,
                error: {
                    side: 'right',
                    code: 'parse_error',
                    message: errRight && errRight.message ? errRight.message : '右侧 JSON 解析失败'
                }
            });
            return;
        }

        try {
            objectStringifyCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
            var oldSorted = sortObjectKeys(leftObj);
            var newSorted = sortObjectKeys(rightObj);
            var diffTree = deepCompare(oldSorted, newSorted);
            var result = generateAlignedDiff(oldSorted, newSorted, diffTree, tabSize);
            self.postMessage({ requestId: requestId, ok: true, result: result });
        } catch (errCompute) {
            self.postMessage({
                requestId: requestId,
                ok: false,
                error: {
                    side: 'unknown',
                    code: 'compute_error',
                    message: errCompute && errCompute.message ? errCompute.message : 'Diff 计算失败'
                }
            });
        }
    });
})();
