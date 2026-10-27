// Normal release-server startup without the debug bridge or WebXR emulator.
// Run with --url http://127.0.0.1:8766/; optional NGC_EXPECT_COMMIT verifies the served build.
export default {name:'startup',query:'?kb&res=0.5',run:async h=>{
  await h.waitFor('document.getElementById("title")',30000);
  await h.expect('!window.__G && getComputedStyle(document.getElementById("title")).display!=="none"','ordinary title, no debug bridge or automatic start');
  await h.eval('(async()=>{window.__releaseVersion=await (await fetch("/version.json")).json();return __releaseVersion})()');
  if(process.env.NGC_EXPECT_COMMIT) await h.expect(`__releaseVersion.commit===${JSON.stringify(process.env.NGC_EXPECT_COMMIT)} && !__releaseVersion.dirty`,'server identifies the clean reviewed experimental commit');
  await h.waitFor('document.querySelector("#enterVR") && !/CHECKING/.test(document.querySelector("#enterVR").textContent)',30000);
  await h.expect('document.querySelector("#enterVR").disabled && /VR UNAVAILABLE/.test(document.querySelector("#enterVR").textContent)','ordinary browser reports unavailable VR without blocking desktop');
  await h.expect('document.querySelector("#xrHands").checked','optional hand tracking defaults on');
  await h.shot('title');await h.key('tap','Enter');
  await h.waitFor('getComputedStyle(document.getElementById("title")).display==="none"',15000);
  await h.expect('!!document.querySelector("#fleet [data-command]") && !!document.querySelector("#fleet [data-research]")','normal play exposes command and research buttons');
  await h.shot('normal-start');await h.notblank();
  await h.page.click('#fleet [data-research]');
  await h.expect('document.getElementById("techBoard").classList.contains("on") && document.getElementById("techBoard").innerText.includes("6 / 19")','HUD research opens with normal starting gates');
  await h.shot('research');await h.key('tap','Escape');await h.key('tap','Escape');
  await h.expect('getComputedStyle(document.getElementById("menu")).display!=="none" && !!document.querySelector("#menu [data-action=research]")','pause menu offers research');
  await h.page.click('#menu [data-action=research]');
  await h.expect('document.getElementById("techBoard").classList.contains("on") && getComputedStyle(document.getElementById("menu")).display==="none"','pause-menu research resumes and opens');
  await h.key('tap','Escape');await h.page.click('#fleet [data-command]');
  await h.expect('document.getElementById("cmdBoard").classList.contains("on")','HUD command button opens the board');
  await h.page.click('#cmdBoard [data-research]');
  await h.expect('document.getElementById("techBoard").classList.contains("on") && !document.getElementById("cmdBoard").classList.contains("on")','board research opens without overlapping command');
  await h.key('tap','Escape');await h.key('tap','Escape');
  await h.expect('/SEA LIFE.*MEDIUM/.test(document.getElementById("menu").innerText)','normal sea-life default is medium');
  await h.shot('pause-settings');await h.key('tap','Escape');
  await h.expect('getComputedStyle(document.getElementById("menu")).display==="none"','normal play resumes');
}};
