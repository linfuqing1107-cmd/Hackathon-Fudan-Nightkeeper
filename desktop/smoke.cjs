const { _electron: electron } = require('playwright');
const path = require('node:path');
(async()=>{
  console.log('Launching packaged executable');
  const application=await electron.launch({executablePath:path.join(__dirname,'release/win-unpacked/Nightkeeper.exe'),timeout:60000,env:{...process.env,NIGHTKEEPER_SMOKE:'true'}});
  application.process().stdout.on('data',data=>process.stdout.write(data));
  application.process().stderr.on('data',data=>process.stderr.write(data));
  try {
    console.log('Waiting for main window');
    const page=await application.firstWindow({timeout:90000});
    await page.waitForLoadState('networkidle',{timeout:30000});
    console.log('Main page loaded');
    if(!(await page.locator('body').innerText()).includes('Nightkeeper')) throw Error('Desktop page did not render');
    const opened=application.waitForEvent('window',{timeout:30000});
    await application.evaluate(({Menu})=>Menu.getApplicationMenu().items[1].submenu.items[0].click());
    const watch=await opened;
    await watch.waitForFunction(()=>Number(document.querySelector('#count')?.textContent)>0);
    if(!(await watch.locator('#source').innerText()).includes('回放'))throw Error('Replay label missing');
    console.log('Windows EXE: main window and bundled watch replay passed');
  } finally {
    const timer=setTimeout(()=>application.process().kill(),10000);
    await application.close();clearTimeout(timer);
  }
})().catch(error=>{console.error(error);process.exit(1)});
