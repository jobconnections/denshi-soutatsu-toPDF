const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('==================================================');
console.log('     denshi-soutatsu-pdf.exe ビルド開始           ');
console.log('==================================================\n');

const rootDir = __dirname;
const distDir = path.join(rootDir, 'dist');
const seaConfigFile = path.join(rootDir, 'sea-config.json');
const bundleFile = path.join(distDir, 'bundle.js');
const blobFile = path.join(distDir, 'sea-prep.blob');
const targetExe = path.join(rootDir, 'denshi-soutatsu-pdf.exe');

// 1. ディレクトリ作成
if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
}

// 2. sea-config.json の準備
const seaConfig = {
    main: "dist/bundle.js",
    output: "dist/sea-prep.blob",
    disableExperimentalSEAWarning: true
};
fs.writeFileSync(seaConfigFile, JSON.stringify(seaConfig, null, 2), 'utf8');

// 3. esbuild によるバンドル
console.log('[1/4] JavaScriptコードおよび全依存モジュールのバンドル中 (esbuild)...');
execSync('npx esbuild index.js --bundle --platform=node --target=node26 --outfile=dist/bundle.js --external:@aws-sdk/client-s3', {
    cwd: rootDir,
    stdio: 'inherit'
});

// 4. SEA blob の生成
console.log('\n[2/4] SEA (Single Executable Application) blob の生成中...');
execSync(`"${process.execPath}" --experimental-sea-config sea-config.json`, {
    cwd: rootDir,
    stdio: 'inherit'
});

// 5. ベースバイナリ (node.exe) のコピー
console.log('\n[3/4] ベース実行バイナリの配置中...');
fs.copyFileSync(process.execPath, targetExe);

// 6. postject によるリソース注入
console.log('\n[4/4] 単一EXEバイナリへのリソース注入中 (postject)...');
execSync(`npx postject "${targetExe}" NODE_SEA_BLOB "${blobFile}" --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`, {
    cwd: rootDir,
    stdio: 'inherit'
});

const stats = fs.statSync(targetExe);
const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

console.log('\n==================================================');
console.log(`【ビルド成功】EXEファイルが生成されました！`);
console.log(`  ファイル名: denshi-soutatsu-pdf.exe`);
console.log(`  サイズ    : ${sizeMB} MB`);
console.log(`  出力場所  : ${targetExe}`);
console.log('==================================================\n');
