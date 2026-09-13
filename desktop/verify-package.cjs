const {existsSync} = require('node:fs');
const path = require('node:path');
module.exports = async ({appOutDir}) => {
  for (const file of ['server/server.js','server/node_modules/next/package.json','server/node_modules/@electric-sql/pglite/package.json','server/.next-desktop/BUILD_ID','watch/NightkeeperWatch.exe','watch/_internal/dashboard.html']) {
    if (!existsSync(path.join(appOutDir,'resources',file))) throw new Error(`Packaged runtime missing: ${file}`);
  }
};
