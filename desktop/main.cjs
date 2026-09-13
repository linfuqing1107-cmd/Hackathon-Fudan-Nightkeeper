const { app, BrowserWindow, Menu, dialog, utilityProcess } = require('electron');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const fs = require('node:fs');
let server, watch, mainWindow, watchWindow, origin, quitting = false;
function fatal(title,message){console.error(title,message);if(process.env.NIGHTKEEPER_SMOKE!=='true')dialog.showErrorBox(title,message);app.quit();}
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { mainWindow?.show(); mainWindow?.focus(); });
function port() { return new Promise((resolve,reject)=>{ const s=net.createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));}); }); }
async function ready(url) {
  for(let i=0;i<120;i++){try{if((await fetch(url,{signal:AbortSignal.timeout(1000)})).ok)return;}catch{}await new Promise(r=>setTimeout(r,500));}
  throw Error('Local service startup timed out');
}
function windowFor(url) {
  const win=new BrowserWindow({width:1440,height:960,minWidth:800,minHeight:600,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
  const allowed=new URL(url).origin;
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(event,target)=>{if(new URL(target).origin!==allowed){event.preventDefault();if(origin&&new URL(target).origin===origin){mainWindow.show();mainWindow.focus();}}});
  win.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  win.loadURL(url);
  return win;
}
async function startWatch(mode) {
  if(watch){dialog.showMessageBox({message:'请先从菜单停止当前手表会话。'});return;}
  if(mode==='ble') {
    const answer=await dialog.showMessageBox({type:'question',buttons:['取消','已取得参与者同意'],defaultId:0,cancelId:0,message:'采集真实心率前，请取得参与者同意，并开启本人手表的心率广播。数据不写入合成患者记录。'});
    if(answer.response!==1)return;
  }
  const exe=path.join(process.resourcesPath,'watch','NightkeeperWatch.exe');
  const args=[mode,'--port','0','--workspace-port',new URL(origin).port];
  if(mode==='ble')args.push('--consent','--desktop');
  watch=spawn(exe,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});
  let pending='';
  watch.stdout.on('data',data=>{
    pending+=data.toString();
    const match=pending.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+/);
    if(match&&!watchWindow){watchWindow=windowFor(match[0]);watchWindow.on('closed',()=>{watchWindow=null;stopWatch();});}
    if(pending.length>8192)pending=pending.slice(-4096);
  });
  watch.stderr.on('data',()=>{});
  watch.on('error',()=>{if(!quitting)dialog.showErrorBox('手表模块无法启动','请重新安装完整的 Windows 演示包。');});
  watch.on('exit',()=>{watch=null;watchWindow?.close();});
}
function stopWatch(){watch?.kill();}
app.whenReady().then(async()=>{
  const p=await port();origin=`http://127.0.0.1:${p}`;
  const data=path.join(app.getPath('userData'),'demo-data');fs.mkdirSync(data,{recursive:true});
  server=utilityProcess.fork(path.join(process.resourcesPath,'server','server.js'),[],{
    cwd:path.join(process.resourcesPath,'server'),
    env:{...process.env,PORT:String(p),HOSTNAME:'127.0.0.1',NIGHTKEEPER_DEMO:'true',DEMO_MODE:'true',DATA_DIR:data},stdio:'pipe'
  });
  server.stdout?.on('data',data=>{if(process.env.NIGHTKEEPER_SMOKE==='true')console.log(data.toString());});
  server.stderr?.on('data',data=>{if(process.env.NIGHTKEEPER_SMOKE==='true')console.error(data.toString());});
  server.on('exit',()=>{if(!quitting)fatal('本地服务已退出','请关闭并重新启动 Nightkeeper。');});
  await ready(origin+'/api/v1/health');
  mainWindow=windowFor(origin);
  mainWindow.on('closed',()=>app.quit());
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {label:'演示',submenu:[{label:'随访工作台',click:()=>{mainWindow.show();mainWindow.focus();}}, {type:'separator'},{role:'quit',label:'退出'}]},
    {label:'手表接入',submenu:[{label:'合成回放',click:()=>startWatch('replay')},{label:'真实 BLE 采集',click:()=>startWatch('ble')},{label:'停止手表会话',click:stopWatch}]},
    {label:'视图',submenu:[{role:'reload',label:'刷新'},{role:'resetZoom',label:'重置缩放'},{role:'zoomIn',label:'放大'},{role:'zoomOut',label:'缩小'}]}
  ]));
}).catch(error=>fatal('启动失败',error.stack||error.message));
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',()=>{quitting=true;stopWatch();server?.kill();});
