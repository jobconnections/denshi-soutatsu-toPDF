const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const puppeteer = require('puppeteer-core');
const unzipper = require('unzipper');
const SaxonJS = require('saxon-js');

// Helper for SaxonJS SEF checksum calculation
function calculateChecksum(a) {
    function b(c, f) {
        f <<= 8;
        for (let l = 0; l < c.length; l++) f = (f << 1) + c.charCodeAt(l);
        return f;
    }
    function d(c, f, l) { return b(c, l) ^ b(f, l); }
    function h(c) {
        e ^= d(c.N, "http://ns.saxonica.com/xslt/export", g++);
        for (let f in c) {
            if (c.hasOwnProperty(f) && "N" !== f && "C" !== f && f !== String.fromCharCode(931)) {
                e ^= d(f, "", g);
                e ^= b(c[f], g);
            }
        }
        c.C && c.C.forEach(function (f) { h(f); });
        e ^= 1;
    }
    let e = 0, g = 0;
    h(a);
    a[String.fromCharCode(931)] = (0 > e ? 4294967295 + e + 1 : e).toString(16);
}

function addParentPointers(a) {
    a.C && a.C.forEach(function (b) {
        b.parentNode = a;
        addParentPointers(b);
    });
}

function TransformOptions() {}
TransformOptions.prototype = {
    stylesheetParams: {},
    templateParams: {},
    tunnelParams: {},
    functionParams: {},
    deliverResultDocument: void 0,
    stylesheetText: ""
};

function invokeSEFTransform(compiler, xslPath, options) {
    options.async = true;
    const checkedOpts = SaxonJS.checkOptions(options);
    return SaxonJS.getResource({ file: xslPath, type: "xml" }).then(res => {
        SaxonJS.internalTransform(compiler, res, checkedOpts);
        return checkedOpts.resultPromise;
    });
}

async function compileXSLT(xslPath) {
    const platform = SaxonJS.getPlatform();
    const compiler = platform.resource("compiler");
    addParentPointers(compiler);

    const h = new TransformOptions();
    h.destination = "application";
    h.initialMode = "compile-complete";
    h.templateParams = { "Q{}options": { noXPath: false } };
    h.stylesheetParams = new SaxonJS.XdmMap();
    h.stylesheetParams.inSituPut(SaxonJS.XS.QName.fromParts("", "", "staticParameters"), [new SaxonJS.XdmMap()]);
    h.stylesheetInternal = compiler;

    const sefResult = await invokeSEFTransform(compiler, xslPath, h);
    let sef = sefResult.principalResult;
    if (Array.isArray(sef)) sef = sef[0];
    const sefJson = SaxonJS.XPath.sefToJSON(sef.firstChild, false);
    calculateChecksum(sefJson);
    return sefJson;
}

async function transformXmlToHtml(xmlPath, xslPath, outPath) {
    let xslContent = fs.readFileSync(xslPath, 'utf8');
    if (xslContent.includes("format-number(")) {
        const newXsl = xslContent.replace(/format-number\(([^,]+),\s*'##'\)/g, "format-number(number($1), '##')");
        if (newXsl !== xslContent) {
            fs.writeFileSync(xslPath, newXsl, 'utf8');
        }
    }

    const platform = SaxonJS.getPlatform();
    const sefJson = await compileXSLT(xslPath);

    const result = await SaxonJS.transform({
        stylesheetText: JSON.stringify(sefJson),
        sourceFileName: platform.fileURL(xmlPath),
        destination: "serialized"
    }, "async");

    fs.writeFileSync(outPath, result.principalResult, 'utf8');
}

function findBrowserExecutable() {
    const candidates = [
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        path.join(process.env.LOCALAPPDATA || '', 'Microsoft\\Edge\\Application\\msedge.exe'),
        path.join(process.env.PROGRAMFILES || '', 'Microsoft\\Edge\\Application\\msedge.exe'),
        path.join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft\\Edge\\Application\\msedge.exe'),
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
        path.join(process.env.PROGRAMFILES || '', 'Google\\Chrome\\Application\\chrome.exe'),
        path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google\\Chrome\\Application\\chrome.exe'),
    ];

    for (const p of candidates) {
        if (p && fs.existsSync(p)) {
            return p;
        }
    }
    return null;
}

function waitForKeyPress() {
    return new Promise(resolve => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        rl.question('\n何かキーを押すと終了します（Enterキーを押してください）...', () => {
            rl.close();
            resolve();
        });
    });
}

function collectTargetZipFiles(args) {
    const targets = [];
    const cwd = process.cwd();
    const exeDir = path.dirname(process.execPath);

    const cleanedArgs = args.filter(arg => !arg.startsWith('--'));

    if (cleanedArgs.length > 0) {
        for (const arg of cleanedArgs) {
            const fullArgPath = path.isAbsolute(arg) ? arg : path.resolve(cwd, arg);
            if (fs.existsSync(fullArgPath)) {
                const stat = fs.statSync(fullArgPath);
                if (stat.isDirectory()) {
                    const entries = fs.readdirSync(fullArgPath);
                    for (const entry of entries) {
                        if (entry.toLowerCase().endsWith('.zip') && entry.toLowerCase() !== 'test.zip') {
                            targets.push({
                                zipPath: path.join(fullArgPath, entry),
                                outputDir: path.join(fullArgPath, 'output')
                            });
                        }
                    }
                } else if (stat.isFile() && fullArgPath.toLowerCase().endsWith('.zip')) {
                    targets.push({
                        zipPath: fullArgPath,
                        outputDir: path.join(path.dirname(fullArgPath), 'output')
                    });
                }
            }
        }
    }

    // If no targets found from arguments, search current working dir and exe dir
    if (targets.length === 0) {
        const searchDirs = [cwd];
        if (exeDir !== cwd && fs.existsSync(exeDir)) {
            searchDirs.push(exeDir);
        }

        const seenZips = new Set();
        for (const sDir of searchDirs) {
            if (!fs.existsSync(sDir)) continue;
            const entries = fs.readdirSync(sDir);
            for (const entry of entries) {
                if (entry.toLowerCase().endsWith('.zip') && entry.toLowerCase() !== 'test.zip') {
                    const fullZp = path.join(sDir, entry);
                    if (!seenZips.has(fullZp)) {
                        seenZips.add(fullZp);
                        targets.push({
                            zipPath: fullZp,
                            outputDir: path.join(sDir, 'output')
                        });
                    }
                }
            }
            if (targets.length > 0) break; // If found in cwd, don't fallback to exeDir
        }
    }

    return targets;
}

async function main() {
    console.log('====================================================');
    console.log('       e-Gov 電子送達 PDF 変換ツール (v1.0.0)       ');
    console.log('====================================================\n');

    const args = process.argv.slice(2);
    const noPause = args.includes('--no-pause') || args.includes('-y');

    const browserPath = findBrowserExecutable();
    if (!browserPath) {
        console.error('【エラー】変換用ブラウザ（Microsoft Edge または Google Chrome）が見つかりませんでした。');
        console.error('Windowsに Microsoft Edge または Google Chrome をインストールしてください。');
        if (!noPause) await waitForKeyPress();
        process.exit(1);
    }
    console.log(`[ブラウザ検出] ${browserPath}`);

    const targetZipItems = collectTargetZipFiles(args);

    if (targetZipItems.length === 0) {
        console.log('【案内】対象となる ZIP ファイルが見つかりませんでした。');
        console.log('・ZIP ファイルと同じフォルダに本EXEを配置して実行するか、');
        console.log('・ZIP ファイル（またはフォルダ）を本EXEのアイコンに直接ドラッグ＆ドロップしてください。\n');
        if (!noPause) await waitForKeyPress();
        return;
    }

    console.log(`[対象ファイル] 合計 ${targetZipItems.length} 件の ZIP ファイルを処理します。\n`);

    let browser;
    try {
        browser = await puppeteer.launch({
            executablePath: browserPath,
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
    } catch (err) {
        console.error('【エラー】ブラウザの起動に失敗しました:', err.message);
        if (!noPause) await waitForKeyPress();
        process.exit(1);
    }

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < targetZipItems.length; i++) {
        const item = targetZipItems[i];
        const zipFileName = path.basename(item.zipPath);
        console.log(`[${i + 1}/${targetZipItems.length}] 処理中: ${zipFileName}`);

        const tempDir = path.join(
            os.tmpdir(),
            `egov_pdf_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
        );

        try {
            fs.mkdirSync(tempDir, { recursive: true });
            await fs.createReadStream(item.zipPath)
                .pipe(unzipper.Extract({ path: tempDir }))
                .promise();

            let extractFolder = tempDir;
            let extractedFiles = fs.readdirSync(extractFolder);
            if (extractedFiles.length === 1 && fs.statSync(path.join(extractFolder, extractedFiles[0])).isDirectory()) {
                extractFolder = path.join(extractFolder, extractedFiles[0]);
                extractedFiles = fs.readdirSync(extractFolder);
            }

            const mainXmlFile = extractedFiles.find(f =>
                f.toLowerCase().endsWith('.xml') &&
                !/^\d+\.xml$/.test(f)
            );

            if (!mainXmlFile) {
                console.log(`  -> メインXMLファイルが見つかりません。スキップします。`);
                failCount++;
                continue;
            }

            let isLandscape = true;
            if (mainXmlFile.includes('保険料納入告知額') || mainXmlFile.includes('領収済額通知書')) {
                isLandscape = false;
            }

            const xmlFullPath = path.join(extractFolder, mainXmlFile);
            const xmlContent = fs.readFileSync(xmlFullPath, 'utf8');
            const xslMatch = xmlContent.match(/<\?xml-stylesheet[^>]+href="([^"]+)"/);
            if (!xslMatch || !xslMatch[1]) {
                console.log(`  -> XML内にスタイルシート (XSL) の指定がありません。スキップします。`);
                failCount++;
                continue;
            }

            const xslFile = xslMatch[1];
            const xslFullPath = path.join(extractFolder, xslFile);
            const htmlFullPath = path.join(extractFolder, 'output.html');

            // XSLT compile & HTML render
            await transformXmlToHtml(xmlFullPath, xslFullPath, htmlFullPath);

            const page = await browser.newPage();
            const url = 'file:///' + htmlFullPath.replace(/\\/g, '/');
            await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });

            // Layout customization
            let customCss = '';
            let pdfMargin = { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' };

            if (mainXmlFile.includes('増減内訳書')) {
                // 増減内訳書 (横向き 2ページ)
                customCss = `
                    html, body {
                        margin: 0 !important;
                        padding: 0 !important;
                    }
                    div, table, .outline, .detail, .caption, .title, .detail3, .jigyosho, .base, .ura {
                        margin-top: 20px !important;
                        margin-bottom: 20px !important;
                        margin-left: auto !important;
                        margin-right: auto !important;
                    }
                `;
                pdfMargin = { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' };
            } else if (mainXmlFile.includes('社会保険料額情報')) {
                // 社会保険料額情報 (横向き 1ページ完結)
                customCss = `
                    @page {
                        size: A4 landscape;
                        margin: 0;
                    }
                    html, body {
                        margin: 0 !important;
                        padding: 0 !important;
                        font-family: "Yu Mincho", serif !important;
                    }
                    table.outline {
                        border: 1px solid #000000 !important;
                        width: 1400px !important;
                        height: 930px !important;
                        margin: 0 auto !important;
                    }
                    table.Rterritory {
                        margin: 5px 40px 0 auto !important;
                    }
                    table.title {
                        margin: 20px auto 15px auto !important;
                    }
                    table.detail {
                        margin: 15px auto 15px auto !important;
                    }
                    table.jigyosho {
                        margin: 15px auto 10px auto !important;
                    }
                    table.caption {
                        margin: 10px auto 20px auto !important;
                    }
                    table.jimusho {
                        margin: 20px auto 5px auto !important;
                    }
                `;
                pdfMargin = { top: '8mm', right: '8mm', bottom: '8mm', left: '8mm' };
            } else if (mainXmlFile.includes('保険料納入告知額') || mainXmlFile.includes('領収済額通知書')) {
                // 保険料納入告知額・領収済額通知書 (縦向き A4最適化)
                customCss = `
                    @page {
                        size: A4 portrait;
                        margin: 0;
                    }
                    html, body {
                        margin: 0 !important;
                        padding: 0 !important;
                        font-family: "Yu Mincho", serif !important;
                    }
                    pre, pre.normal, pre.oshirase, pre.big {
                        white-space: pre-wrap !important;
                        font-family: inherit !important;
                        margin: 0 !important;
                    }
                    body {
                        zoom: 1.15;
                    }
                    table.outline {
                        margin: 0 auto !important;
                    }
                `;
                pdfMargin = { top: '8mm', right: '8mm', bottom: '8mm', left: '8mm' };
            } else {
                customCss = `
                    html, body { margin: 0 !important; padding: 0 !important; }
                    table.outline { margin: 0 auto !important; }
                `;
            }

            await page.addStyleTag({ content: customCss });

            if (!fs.existsSync(item.outputDir)) {
                fs.mkdirSync(item.outputDir, { recursive: true });
            }

            const pdfFilename = mainXmlFile.replace(/\.xml$/i, '.pdf');
            const pdfPath = path.join(item.outputDir, pdfFilename);

            await page.pdf({
                path: pdfPath,
                format: 'A4',
                landscape: isLandscape,
                printBackground: true,
                margin: pdfMargin
            });

            console.log(`  -> 【成功】PDF出力完了: ${pdfFilename} (${isLandscape ? '横向き' : '縦向き'})`);
            console.log(`     保存先: ${pdfPath}`);
            await page.close();
            successCount++;
        } catch (err) {
            console.error(`  -> 【失敗】エラーが発生しました: ${err.message}`);
            failCount++;
        } finally {
            if (fs.existsSync(tempDir)) {
                try {
                    fs.rmSync(tempDir, { recursive: true, force: true });
                } catch (e) {}
            }
        }
    }

    try {
        await browser.close();
    } catch (e) {}

    console.log('\n====================================================');
    console.log(`処理完了: 成功 ${successCount} 件 / 失敗 ${failCount} 件`);
    console.log('====================================================');

    if (!noPause) {
        await waitForKeyPress();
    }
}

main().catch(async (err) => {
    console.error('\n予期せぬ重大なエラーが発生しました:', err);
    await waitForKeyPress();
    process.exit(1);
});
