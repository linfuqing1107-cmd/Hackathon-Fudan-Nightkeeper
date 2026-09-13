const { _electron: electron } = require('playwright');
const path = require('node:path');
(async()=>{
  const application=await electron.launch({executablePath:path.join(__dirname,'release/win-unpacked/Nightkeeper.exe')});
  try {
    const page=await application.firstWindow({timeout:90000});
    await page.waitForLoadState('networkidle');
    if(!(await page.locator('body').innerText()).includes('Nightkeeper')) throw Error('Desktop page did not render');
    const opened=application.waitForEvent('window',{timeout:30000});
    await application.evaluate(({Menu})=>Menu.getApplicationMenu().items[1].submenu.items[0].click());
    const watch=await opened;
    await watch.waitForFunction(()=>Number(document.querySelector('#count')?.textContent)>0);
    if(!(await watch.locator('#source').innerText()).includes('回放'))throw Error('Replay label missing');
    console.log('Windows EXE: main window and bundled watch replay passed');
  } finally {await application.close();}
})().catch(error=>{console.error(error);process.exit(1)});
