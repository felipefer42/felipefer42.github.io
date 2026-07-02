"use strict";

const $ = id => document.getElementById(id);
const C = {c: 299792458, h: 6.62607015e-34, k: 1.380649e-23, pc: 3.085677581491367e16, rsun: 6.957e8, jy: 1e-26};
const GRID_MIN=100,GRID_MAX=3000;
const grid = Array.from({length: GRID_MAX-GRID_MIN+1}, (_, i) => GRID_MIN+i);
const state = {
  mode:"components", source:"blackbody", axisMode:"lambda", photometricSystem:"AB", showReference:true, vegaSpectrum:null, spectrum:null, spectra:[], activeSpectrum:-1,
  filters:[], activeFilter:-1, files:{}, fileNames:{}, realBand:null,
  xMin:200,xMax:1200,
  params:{shape:"rect",center:550,width:100,peak:1,top:60,sigma:45},
  componentParams:{
    atmosphere:{shape:"atmospheric",center:700,width:600,top:400,peak:.88},
    instrument:{shape:"smooth",center:650,width:700,top:500,peak:.82},
    detector:{shape:"ccd",center:700,width:600,top:400,peak:.90}
  }
};
const stages = [
  ["Comece pelo essencial","Escolha uma fonte e altere as bordas do filtro. O que acontece com a magnitude?"],
  ["Coloque a atmosfera no caminho","Ative a atmosfera e procure no gráfico as bandas de absorção idealizadas."],
  ["Agora, a óptica","Compare a magnitude antes e depois das perdas nos espelhos e lentes."],
  ["Fótons viram elétrons","Ative a eficiência quântica e observe como ela muda a resposta total."],
  ["Encontre o mundo real","Use o espectro e as passbands Gaia. A curva Gaia já representa todo o sistema."]
];
const ABSORPTION_LINES = [
  {nm:393.4,strength:.85,label:"Ca K"},{nm:396.8,strength:.75,label:"Ca H"},
  {nm:434.0,strength:.55,label:"Hγ"},{nm:486.1,strength:.65,label:"Hβ"},
  {nm:517.0,strength:.45,label:"Mg"},{nm:589.3,strength:.50,label:"Na"},
  {nm:656.3,strength:1.00,label:"Hα"}
];

function clamp(v,a=0,b=1){return Math.max(a,Math.min(b,v))}
function interp(data,x){
  if(!data || x<data[0][0] || x>data[data.length-1][0]) return 0;
  let lo=0,hi=data.length-1;
  while(hi-lo>1){const m=(lo+hi)>>1;if(data[m][0]<=x)lo=m;else hi=m}
  const [x0,y0]=data[lo],[x1,y1]=data[hi],t=(x-x0)/(x1-x0||1);
  return y0+t*(y1-y0);
}
function trapz(y,x=grid){let s=0;for(let i=1;i<y.length;i++)s+=(y[i]+y[i-1])*(x[i]-x[i-1])/2;return s}
function blackbody(){
  const T=+$("temperature").value,R=+$("radius").value*C.rsun,d=+$("distance").value*C.pc;
  return grid.map(nm=>{const m=nm*1e-9;const Bl=2*C.h*C.c*C.c/Math.pow(m,5)/(Math.exp(C.h*C.c/(m*C.k*T))-1);return Math.PI*Bl*(R/d)**2*1e-9});
}
function flatFnu(){
  const fnu=3631*C.jy;
  return grid.map(nm=>fnu*C.c/Math.pow(nm*1e-9,2)*1e-9);
}
function referenceFlux(){
  return state.photometricSystem==="Vega"?grid.map(x=>interp(state.vegaSpectrum,x)):flatFnu();
}
function absorptionBlackbody(){
  const continuum=blackbody(),depth=+$("lineDepth").value/100;
  const sigma=(+$("lineWidth").value)/2.35482;
  return continuum.map((value,i)=>{
    const wavelength=grid[i];
    const transmission=ABSORPTION_LINES.reduce((total,line)=>total*(1-depth*line.strength*Math.exp(-.5*Math.pow((wavelength-line.nm)/sigma,2))),1);
    return value*clamp(transmission);
  });
}
function sourceFlux(){
  if(state.source==="blackbody")return blackbody();
  if(state.source==="absorption")return absorptionBlackbody();
  if(state.source==="flatfnu")return flatFnu();
  return grid.map(x=>interp(state.spectrum,x));
}
function idealResponse(p){
  return grid.map(x=>{
    const d=Math.abs(x-p.center),w=p.width/2;
    if(p.shape==="rect")return d<w?p.peak:Math.abs(d-w)<1e-9?p.peak/2:0;
    if(p.shape==="triangle")return p.peak*clamp(1-d/w);
    if(p.shape==="gaussian")return p.peak*Math.exp(-.5*((x-p.center)/p.sigma)**2);
    const top=p.top/2;
    return d<=top?p.peak:d<=w?p.peak*(w-d)/(w-top):0;
  });
}
function filterResponse(){
  const p=state.params;
  if(p.shape==="file") return grid.map(x=>interp(state.filters[state.activeFilter]?.data,x));
  return idealResponse(p);
}
function atmoResponse(showConfigured=false){
  if(state.mode==="real")return grid.map(()=>1);
  if(!$("atmosphereEnabled").checked&&!showConfigured)return grid.map(()=>1);
  const p=state.componentParams.atmosphere;
  if(p.shape==="file")return grid.map(x=>interp(state.files.atmosphere,x));
  if(["rect","triangle","trapezoid"].includes(p.shape))return idealResponse(p);
  return grid.map(x=>clamp(p.peak*(1-.18*Math.exp(-.5*((x-690)/16)**2)-.42*Math.exp(-.5*((x-760)/10)**2)-.32*Math.exp(-.5*((x-940)/24)**2))*(1-.5*Math.exp(-(x-300)/35))));
}
function instResponse(showConfigured=false){
  if(state.mode==="real")return grid.map(()=>1);
  if(!$("instrumentEnabled").checked&&!showConfigured)return grid.map(()=>1);
  const p=state.componentParams.instrument;
  if(p.shape==="file")return grid.map(x=>interp(state.files.instrument,x));
  if(["rect","triangle","trapezoid"].includes(p.shape))return idealResponse(p);
  return grid.map(x=>clamp(p.peak*(1-.0000009*(x-p.center)**2)));
}
function detResponse(showConfigured=false){
  if(state.mode==="real")return grid.map(()=>1);
  if(!$("detectorEnabled").checked&&!showConfigured)return grid.map(()=>1);
  const p=state.componentParams.detector;
  if(p.shape==="file")return grid.map(x=>interp(state.files.detector,x));
  if(["rect","triangle","trapezoid"].includes(p.shape))return idealResponse(p);
  return grid.map(x=>p.peak*clamp((x-300)/220)*clamp((1100-x)/250));
}
function calculate(){
  const flux=sourceFlux(),parts=[filterResponse(),atmoResponse(),instResponse(),detResponse()];
  const response=grid.map((_,i)=>parts.reduce((v,a)=>v*a[i],1));
  const num=trapz(grid.map((l,i)=>flux[i]*response[i]*l*1e-9));
  const den=trapz(grid.map((l,i)=>response[i]/l));
  const fnu=num/(C.c*den),jy=fnu/C.jy,mag=-2.5*Math.log10(jy/3631);
  const reference=referenceFlux();
  const referenceNum=trapz(grid.map((l,i)=>reference[i]*response[i]*l*1e-9));
  const referenceFnu=referenceNum/(C.c*den);
  const displayedMagnitude=state.photometricSystem==="Vega"?-2.5*Math.log10(fnu/referenceFnu):mag;
  const rInt=trapz(response);
  const photonWeight=grid.map((l,i)=>flux[i]*response[i]*l);
  const photonInt=trapz(photonWeight);
  const lambdaEff=photonInt?trapz(grid.map((l,i)=>l*photonWeight[i]))/photonInt:NaN;
  const nuGrid=grid.map(l=>C.c*1e-3/l);
  const nuEff=photonInt?trapz(grid.map((_,i)=>nuGrid[i]*photonWeight[i]))/photonInt:NaN;
  const maxR=Math.max(...response),eqLambda=maxR?rInt/maxR:0,eqNu=maxR?Math.abs(trapz(response,nuGrid))/maxR:0;
  $("magnitude").textContent=Number.isFinite(displayedMagnitude)?(Math.abs(displayedMagnitude)<5e-4?0:displayedMagnitude).toFixed(3):"—";
  $("magnitudeUnit").innerHTML=state.photometricSystem==="Vega"?"mag<sub>Vega</sub>":"mag<sub>AB</sub>";
  $("magnitudeEquation").innerHTML=state.photometricSystem==="Vega"
    ?'<span>m<sub>Vega</sub></span><span>=</span><span>−2,5 log<sub>10</sub></span><span class="math-fraction"><span>⟨f<sub>ν</sub>⟩</span><span>⟨f<sub>ν,Vega</sub>⟩</span></span>'
    :'<span>m<sub>AB</sub></span><span>=</span><span>−2,5 log<sub>10</sub></span><span class="math-fraction"><span>⟨f<sub>ν</sub>⟩</span><span>3631 Jy</span></span>';
  $("magnitudeExplanation").innerHTML=state.photometricSystem==="Vega"?"O fluxo de referência é o espectro CALSPEC de Vega integrado pela mesma resposta S(λ).":"A referência AB possui f<sub>ν</sub> constante de 3631 Jy.";
  $("referenceLegend").textContent=state.photometricSystem==="Vega"?"Vega (CALSPEC)":"Referência AB · 3631 Jy";
  $("meanFnu").textContent=Number.isFinite(jy)?formatSci(jy):"—";
  $("effectiveWave").textContent=Number.isFinite(lambdaEff)?(state.axisMode==="lambda"?lambdaEff:nuEff).toFixed(1):"—";
  $("effectiveLabel").textContent=state.axisMode==="lambda"?"λ efetivo":"ν efetiva";
  $("effectiveUnit").textContent=state.axisMode==="lambda"?"nm":"THz";
  $("effectiveEquation").innerHTML=state.axisMode==="lambda"
    ?'<span>λ<sub>ef</sub></span><span>=</span><span class="math-fraction"><span><i>∫</i> λ W(λ) dλ</span><span><i>∫</i> W(λ) dλ</span></span>'
    :'<span>ν<sub>ef</sub></span><span>=</span><span class="math-fraction"><span><i>∫</i> ν(λ) W(λ) dλ</span><span><i>∫</i> W(λ) dλ</span></span>';
  $("equivWidth").textContent=(state.axisMode==="lambda"?eqLambda:eqNu).toFixed(1);
  $("equivWidthUnit").textContent=state.axisMode==="lambda"?"nm":"THz";
  $("equivEquation").innerHTML=state.axisMode==="lambda"
    ?'<span>W<sub>eq</sub></span><span>=</span><span class="math-fraction"><span><i>∫</i> S(λ) dλ</span><span>máx[S(λ)]</span></span>'
    :'<span>W<sub>eq</sub></span><span>=</span><span class="math-fraction"><span>|<i>∫</i> S(ν) dν|</span><span>máx[S(ν)]</span></span>';
  $("plotSubtitle").textContent=state.source==="blackbody"?`Corpo negro · ${(+$("temperature").value).toLocaleString("pt-BR")} K`:state.source==="absorption"?`Corpo negro com linhas idealizadas · ${(+$("temperature").value).toLocaleString("pt-BR")} K`:state.source==="flatfnu"?"Fν constante · 3631 Jy":(state.spectra[state.activeSpectrum]?.name||"Espectro real");
  const spectralVariable=state.axisMode==="lambda"?"λ":"ν";
  $("filterPlotLabel").textContent=state.realBand?`Gaia ${state.realBand} · resposta combinada`:shapeName(state.params.shape);
  $("atmospherePlotLabel").textContent=$("atmosphereEnabled").checked?`${state.fileNames.atmosphere||componentShapeName(state.componentParams.atmosphere.shape)} · incluída em S(${spectralVariable})`:`Não incluída em S(${spectralVariable})`;
  $("instrumentPlotLabel").textContent=$("instrumentEnabled").checked?`${state.fileNames.instrument||componentShapeName(state.componentParams.instrument.shape)} · incluído em S(${spectralVariable})`:`Não incluído em S(${spectralVariable})`;
  $("detectorPlotLabel").textContent=$("detectorEnabled").checked?`${state.fileNames.detector||componentShapeName(state.componentParams.detector.shape)} · incluída em S(${spectralVariable})`:`Não incluída em S(${spectralVariable})`;
  document.querySelectorAll(".axis-label").forEach(label=>label.textContent=state.axisMode==="lambda"?"Comprimento de onda (nm)":"Frequência (THz)");
  $("spectrumLegend").textContent=state.axisMode==="lambda"?"Fλ":"Fν";
  $("filterPanelTitle").innerHTML=`Filtro: T(${spectralVariable})`;
  $("instrumentPanelTitle").innerHTML=`Instrumento: T<sub>inst</sub>(${spectralVariable})`;
  $("atmospherePanelTitle").innerHTML=`Atmosfera: T<sub>atm</sub>(${spectralVariable})`;
  $("detectorPanelTitle").innerHTML=`Eficiência do detector: EQ(${spectralVariable})`;
  $("totalResponseTitle").innerHTML=`Transmissão total S(${spectralVariable}) = T(${spectralVariable}) × T<sub>inst</sub>(${spectralVariable}) × T<sub>atm</sub>(${spectralVariable}) × EQ(${spectralVariable})`;
  $("responseLegend").textContent=`S(${spectralVariable})`;
  const showComponents=state.mode==="components";
  $("filterPlotCard").hidden=!showComponents;
  $("instrumentPlotCard").hidden=!showComponents||!$("instrumentEnabled").checked;
  $("atmospherePlotCard").hidden=!showComponents||!$("atmosphereEnabled").checked;
  $("detectorPlotCard").hidden=!showComponents||!$("detectorEnabled").checked;
  drawCharts(flux,parts,response);
}
function formatSci(v){if(v===0)return"0";if(v>=.01&&v<1e5)return v.toFixed(3);return v.toExponential(2)}
function shapeName(s){return({rect:"filtro retangular",triangle:"filtro triangular",trapezoid:"filtro trapezoidal",gaussian:"filtro gaussiano",file:"curva carregada"})[s]}
function componentShapeName(s){return({atmospheric:"modelo atmosférico",smooth:"óptica suave",ccd:"CCD idealizado",rect:"retangular",triangle:"triangular",trapezoid:"trapezoidal",file:"curva carregada"})[s]}

function filterControls(){
  const p=state.params,s=p.shape;
  if(s==="trapezoid")p.top=Math.min(p.top,Math.max(0,p.width-1));
  let html=`<label>Comprimento central <output>${p.center} nm</output><input data-p="center" type="range" min="${GRID_MIN}" max="${GRID_MAX}" step="5" value="${p.center}"></label>`;
  if(s==="gaussian")html+=`<label>Desvio padrão <output>${p.sigma} nm</output><input data-p="sigma" type="range" min="5" max="200" step="5" value="${p.sigma}"></label>`;
  else html+=`<label>Largura total <output>${p.width} nm</output><input data-p="width" type="range" min="1" max="1000" step="1" value="${p.width}"></label>`;
  if(s==="trapezoid")html+=`<label>Topo plano <output>${Math.min(p.top,Math.max(0,p.width-1))} nm</output><input data-p="top" type="range" min="0" max="${Math.max(0,p.width-1)}" step="1" value="${Math.min(p.top,Math.max(0,p.width-1))}"></label>`;
  html+=`<label>Transmissão máxima <output>${Math.round(p.peak*100)}%</output><input data-p="peak" type="range" min="5" max="100" step="5" value="${p.peak*100}"></label>`;
  $("filterParams").innerHTML=s==="file"?"":html;
  $("filterFileLabel").hidden=s!=="file";
  $("filterSelectLabel").hidden=s!=="file"||!state.filters.length;
  document.querySelectorAll("#filterParams input").forEach(el=>el.addEventListener("input",e=>{
    const key=e.target.dataset.p;
    state.params[key]=key==="peak"?+e.target.value/100:+e.target.value;
    const output=e.target.parentElement.querySelector("output");
    output.textContent=key==="peak"?`${Math.round(state.params[key]*100)}%`:`${state.params[key]} nm`;
    if(key==="width"&&state.params.shape==="trapezoid"){
      const topInput=document.querySelector('#filterParams input[data-p="top"]');
      topInput.max=Math.max(0,state.params.width-1);
      if(state.params.top>+topInput.max){
        state.params.top=+topInput.max;
        topInput.value=state.params.top;
        topInput.parentElement.querySelector("output").textContent=`${state.params.top} nm`;
      }
    }
    calculate();
  }));
}
function componentControls(kind){
  const p=state.componentParams[kind],container=$(`${kind}Params`);
  if(p.shape==="file"){container.innerHTML="";return}
  const isGeometric=["rect","triangle","trapezoid"].includes(p.shape);
  let html="";
  if(isGeometric){
    html+=`<label>Comprimento central <output>${p.center} nm</output><input data-p="center" type="range" min="${GRID_MIN}" max="${GRID_MAX}" step="5" value="${p.center}"></label>`;
    html+=`<label>Largura total <output>${p.width} nm</output><input data-p="width" type="range" min="10" max="900" step="10" value="${p.width}"></label>`;
    if(p.shape==="trapezoid")html+=`<label>Topo plano <output>${p.top} nm</output><input data-p="top" type="range" min="0" max="${Math.max(0,p.width-10)}" step="10" value="${Math.min(p.top,p.width-10)}"></label>`;
  }else if(p.shape==="smooth"){
    html+=`<label>Centro de máxima eficiência <output>${p.center} nm</output><input data-p="center" type="range" min="${GRID_MIN}" max="${GRID_MAX}" step="10" value="${p.center}"></label>`;
  }
  const peakLabel=kind==="atmosphere"?"Transmissão máxima":kind==="detector"?"Eficiência máxima":"Eficiência máxima";
  html+=`<label>${peakLabel} <output>${Math.round(p.peak*100)}%</output><input data-p="peak" type="range" min="5" max="100" step="1" value="${p.peak*100}"></label>`;
  container.innerHTML=html;
  container.querySelectorAll("input").forEach(el=>el.addEventListener("input",e=>{
    const key=e.target.dataset.p;
    p[key]=key==="peak"?+e.target.value/100:+e.target.value;
    e.target.parentElement.querySelector("output").textContent=key==="peak"?`${Math.round(p.peak*100)}%`:`${p[key]} nm`;
    if(key==="width"&&p.shape==="trapezoid"){
      const topInput=container.querySelector('[data-p="top"]');
      topInput.max=Math.max(0,p.width-10);
      if(p.top>+topInput.max){p.top=+topInput.max;topInput.value=p.top;topInput.parentElement.querySelector("output").textContent=`${p.top} nm`}
    }
    calculate();
  }));
}

async function loadText(url){const r=await fetch(url);if(!r.ok)throw Error(r.status);return r.text()}
function parseTwoColumns(text,waveFactor=1,transmission=false){
  const rows=[];
  text.replace(/^\uFEFF/,"").split(/\r?\n/).forEach(line=>{
    const vals=line.trim().split(/[\s,;]+/).map(Number);
    if(vals.length>=2&&Number.isFinite(vals[0])&&Number.isFinite(vals[1]))rows.push([vals[0]*waveFactor,transmission?(vals[1]>1?vals[1]/100:vals[1]):vals[1]]);
  });
  return rows.sort((a,b)=>a[0]-b[0]);
}
async function fileData(file,kind){
  const text=await file.text(),isTrans=kind!=="spectrum";
  let rows=parseTwoColumns(text,1,isTrans);
  if(!rows.length)throw Error("Nenhuma linha numérica com duas colunas.");
  if(kind==="filter"||kind==="atmosphere"||kind==="instrument"||kind==="detector"){
    const maxWave=rows[rows.length-1][0];
    if(maxWave>2000)rows=rows.map(([x,y])=>[x/10,y]);
  }
  return rows;
}
function updateCollectionUI(kind){
  const isSpectrum=kind==="spectrum",items=isSpectrum?state.spectra:state.filters;
  const select=$(isSpectrum?"spectrumSelect":"filterSelect");
  const label=$(isSpectrum?"spectrumSelectLabel":"filterSelectLabel");
  const active=isSpectrum?state.activeSpectrum:state.activeFilter;
  select.innerHTML=items.map((item,i)=>`<option value="${i}"${i===active?" selected":""}>${item.name}</option>`).join("");
  label.hidden=!items.length;
  if(isSpectrum)$("spectrumStatus").textContent=items.length?`${items.length} espectro(s) disponível(is). Selecione o ativo acima.`:"Duas colunas: comprimento de onda, fluxo.";
}
function activateCollection(kind,index){
  index=+index;
  if(kind==="spectrum"){
    state.activeSpectrum=index;
    state.spectrum=state.spectra[index]?.data||null;
  }else{
    state.activeFilter=index;
    state.realBand=state.filters[index]?.band||null;
    state.params.shape="file";
    $("filterShape").value="file";
    filterControls();
  }
  updateCollectionUI(kind);
  calculate();
}
function bindMultipleFiles(id,kind){
  $(id).addEventListener("change",async e=>{
    const loaded=[];
    for(const file of e.target.files){
      try{loaded.push({name:file.name,data:await fileData(file,kind),band:null})}
      catch(err){alert(`Não foi possível ler ${file.name}: ${err.message}`)}
    }
    if(!loaded.length)return;
    if(kind==="spectrum"){
      state.spectra.push(...loaded);
      activateCollection("spectrum",state.spectra.length-loaded.length);
    }else{
      state.filters.push(...loaded);
      activateCollection("filter",state.filters.length-loaded.length);
    }
    e.target.value="";
  });
}
function bindComponentFile(id,kind){
  $(id).addEventListener("change",async e=>{
    try{state.files[kind]=await fileData(e.target.files[0],kind);state.fileNames[kind]=e.target.files[0].name;calculate()}
    catch(err){alert("Não foi possível ler o arquivo: "+err.message)}
  });
}
async function loadExampleCurve(kind,url,name){
  try{
    state.files[kind]=parseTwoColumns(await loadText(url),1,true);
    state.fileNames[kind]=name;
    state.componentParams[kind].shape="file";
    $(`${kind}Shape`).value="file";
    $(kind==="atmosphere"?"atmoFileLabel":kind==="instrument"?"instFileLabel":"detFileLabel").hidden=false;
    $(`${kind}Enabled`).checked=true;
    componentControls(kind);calculate();
  }catch{
    alert("Abra a atividade por um servidor local para usar a curva de exemplo.");
  }
}

function setMode(mode){
  state.mode=mode;
  document.querySelectorAll("[data-mode]").forEach(button=>button.classList.toggle("active",button.dataset.mode===mode));
  const isReal=mode==="real";
  $("stageLabel").textContent=isReal?"MODO SISTEMA REAL":"MODO COMPONENTES";
  $("stageTitle").textContent=isReal?"Use uma passband calibrada":"Construa o caminho óptico";
  $("stagePrompt").textContent=isReal?"As curvas Gaia já combinam filtro, instrumento e detector.": "Ative atmosfera, instrumento e detector para compor a transmissão total.";
  ["filterControlsCard","atmosphereControlsCard","instrumentControlsCard","detectorControlsCard"].forEach(id=>$(id).hidden=isReal);
  $("realSystems").hidden=!isReal;
  $("componentPlotsScroller").hidden=isReal;
  if(!isReal&&state.realBand){
    state.realBand=null;state.params.shape="rect";$("filterShape").value="rect";filterControls();
    document.querySelectorAll("[data-gaia]").forEach(button=>button.classList.remove("active"));
  }
  calculate();
  if(isReal&&!state.realBand)document.querySelector('[data-gaia="G"]').click();
}
function reset(){
  state.mode="components";state.source="blackbody";state.axisMode="lambda";state.photometricSystem="AB";state.showReference=true;state.xMin=200;state.xMax=1200;state.spectrum=null;state.spectra=[];state.activeSpectrum=-1;state.filters=[];state.activeFilter=-1;state.files={};state.fileNames={};state.realBand=null;state.params={shape:"rect",center:550,width:100,peak:1,top:60,sigma:45};
  state.componentParams={
    atmosphere:{shape:"atmospheric",center:700,width:600,top:400,peak:.88},
    instrument:{shape:"smooth",center:650,width:700,top:500,peak:.82},
    detector:{shape:"ccd",center:700,width:600,top:400,peak:.90}
  };
  $("temperature").value=5800;$("radius").value=1;$("distance").value=10;$("lineDepth").value=55;$("lineWidth").value=4;$("filterShape").value="rect";
  $("axisMin").value=200;$("axisMax").value=1200;
  $("atmosphereShape").value="atmospheric";$("instrumentShape").value="smooth";$("detectorShape").value="ccd";
  ["atmosphereEnabled","instrumentEnabled","detectorEnabled"].forEach(id=>$(id).checked=false);
  document.querySelectorAll(".source-tab").forEach(b=>b.classList.toggle("active",b.dataset.source==="blackbody"));
  document.querySelectorAll("[data-axis]").forEach(b=>b.classList.toggle("active",b.dataset.axis==="lambda"));
  document.querySelectorAll("[data-photometric-system]").forEach(b=>b.classList.toggle("active",b.dataset.photometricSystem==="AB"));
  $("referenceToggle").textContent="Ocultar referência";$("referenceToggle").setAttribute("aria-pressed","true");$("referenceLegendItem").hidden=false;
  $("blackbodyControls").hidden=false;$("absorptionControls").hidden=true;$("fileControls").hidden=true;updateCollectionUI("spectrum");updateCollectionUI("filter");filterControls();
  ["atmosphere","instrument","detector"].forEach(componentControls);setMode("components");
}

function setupCanvas(id){
  const canvas=$(id),rect=canvas.getBoundingClientRect(),dpr=devicePixelRatio||1;
  canvas.width=rect.width*dpr;canvas.height=rect.height*dpr;
  const ctx=canvas.getContext("2d");ctx.scale(dpr,dpr);
  return {canvas,rect,ctx,W:rect.width,H:rect.height};
}
function axes(ctx,W,H,p,rightLabels=true,yMax=1){
  const pw=W-p.l-p.r,ph=H-p.t-p.b,nuMin=C.c*1e-3/state.xMax,nuMax=C.c*1e-3/state.xMin;
  const x=l=>state.axisMode==="lambda"?p.l+(l-state.xMin)/(state.xMax-state.xMin)*pw:p.l+(nuMax-(C.c*1e-3/l))/(nuMax-nuMin)*pw;
  ctx.font="10px system-ui";ctx.strokeStyle="#e6e9ed";ctx.fillStyle="#748093";ctx.lineWidth=1;
  for(let i=0;i<=4;i++){const y=p.t+i*ph/4;ctx.beginPath();ctx.moveTo(p.l,y);ctx.lineTo(W-p.r,y);ctx.stroke();if(rightLabels)ctx.fillText((yMax*(1-i/4)).toFixed(2),W-p.r+6,y+3)}
  const ticks=Array.from({length:6},(_,i)=>{
    const fraction=i/5;
    if(state.axisMode==="lambda"){
      const v=state.xMin+(state.xMax-state.xMin)*fraction;
      return {v,label:Math.round(v),x:p.l+fraction*pw};
    }
    const v=nuMax-(nuMax-nuMin)*fraction;
    return {v,label:Math.round(v),x:p.l+fraction*pw};
  });
  ticks.forEach(t=>{ctx.beginPath();ctx.moveTo(t.x,p.t);ctx.lineTo(t.x,H-p.b);ctx.stroke();ctx.fillText(t.label,t.x-11,H-9)});
  return {pw,ph,x,nuMin,nuMax};
}
function strokeCurve(ctx,values,x,y,color,width=2,alpha=1){
  ctx.save();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.globalAlpha=alpha;ctx.beginPath();
  values.forEach((v,i)=>i?ctx.lineTo(x(grid[i]),y(v)):ctx.moveTo(x(grid[i]),y(v)));ctx.stroke();ctx.restore();
}
function withPlotClip(ctx,p,W,H,draw){
  ctx.save();ctx.beginPath();ctx.rect(p.l,p.t,W-p.l-p.r,H-p.t-p.b);ctx.clip();draw();ctx.restore();
}
function visibleValues(values){
  return values.filter((value,i)=>grid[i]>=state.xMin&&grid[i]<=state.xMax&&Number.isFinite(value));
}
function displayFlux(flux){
  if(state.axisMode==="lambda")return flux;
  return flux.map((value,i)=>value*1e9*Math.pow(grid[i]*1e-9,2)/C.c/C.jy);
}
function wavelengthRgb(nm){
  const gray=[.38,.38,.38];
  if(nm<340||nm>820)return gray;
  if(nm<380){
    const t=(nm-340)/40,violet=[.3,0,.3];
    return gray.map((value,i)=>value*(1-t)+violet[i]*t);
  }
  if(nm>780){
    const t=(nm-780)/40,red=[.3,0,0];
    return red.map((value,i)=>value*(1-t)+gray[i]*t);
  }
  let r=0,g=0,b=0;
  if(nm>=380&&nm<440){r=-(nm-440)/60;b=1}
  else if(nm<490&&nm>=440){g=(nm-440)/50;b=1}
  else if(nm<510&&nm>=490){g=1;b=-(nm-510)/20}
  else if(nm<580&&nm>=510){r=(nm-510)/70;g=1}
  else if(nm<645&&nm>=580){r=1;g=-(nm-645)/65}
  else if(nm<=780&&nm>=645){r=1}
  let edge=1;
  if(nm>=380&&nm<420)edge=.3+.7*(nm-380)/40;
  else if(nm>700&&nm<=780)edge=.3+.7*(780-nm)/80;
  return [r*edge,g*edge,b*edge];
}
function sampleRegular(values,nm){
  const position=clamp(nm-GRID_MIN,0,grid.length-1),i=Math.floor(position),t=position-i;
  return values[i]+((values[Math.min(i+1,values.length-1)]-values[i])*t);
}
function drawSpectralStrip(id,flux,response,transmitted=false){
  const {ctx,W,H}=setupCanvas(id),p={l:57,r:34},pw=W-p.l-p.r;
  const shownFlux=displayFlux(flux),maximum=Math.max(...visibleValues(shownFlux).filter(v=>v>0),1e-99);
  const nuMin=C.c*1e-3/state.xMax,nuMax=C.c*1e-3/state.xMin;
  ctx.fillStyle="#fff";ctx.fillRect(0,0,W,H);
  for(let px=Math.floor(p.l);px<=Math.ceil(W-p.r);px++){
    const fraction=clamp((px-p.l)/pw);
    const nm=state.axisMode==="lambda"?state.xMin+(state.xMax-state.xMin)*fraction:C.c*1e-3/(nuMax-(nuMax-nuMin)*fraction);
    const throughput=transmitted?sampleRegular(response,nm):1;
    const intensity=clamp(sampleRegular(shownFlux,nm)/maximum*throughput);
    const color=wavelengthRgb(nm);
    if(!color){ctx.fillStyle="#fff"}
    else{
      const [r,g,b]=color;
      ctx.fillStyle=`rgb(${Math.round(255*(1-intensity+r*intensity))},${Math.round(255*(1-intensity+g*intensity))},${Math.round(255*(1-intensity+b*intensity))})`;
    }
    ctx.fillRect(px,0,1,H);
  }
  ctx.strokeStyle="#d9dee5";ctx.strokeRect(p.l+.5,.5,pw-1,H-1);
}
function drawSpectrumChart(flux,response){
  const {canvas,rect,ctx,W,H}=setupCanvas("spectrumChart"),p={l:57,r:34,t:14,b:31};
  const rawCurves=state.source==="file"&&state.spectra.length?state.spectra.map(s=>grid.map(x=>interp(s.data,x))):[flux];
  const curves=rawCurves.map(displayFlux),activeFlux=displayFlux(flux),reference=displayFlux(referenceFlux());
  const visibleReference=state.showReference?visibleValues(reference).filter(v=>v>0):[];
  const fmax=Math.max(...curves.flatMap(visibleValues),...visibleReference,1e-99),ymax=fmax*1.05;
  const {pw,ph,x,nuMin,nuMax}=axes(ctx,W,H,p,false);
  const y=f=>p.t+ph-clamp(f/ymax)*ph;
  const measuredFlux=activeFlux.map((value,i)=>value*response[i]);
  withPlotClip(ctx,p,W,H,()=>{
    ctx.fillStyle="rgba(242,139,69,.42)";
    ctx.beginPath();ctx.moveTo(x(grid[0]),p.t+ph);
    measuredFlux.forEach((value,i)=>ctx.lineTo(x(grid[i]),y(value)));
    ctx.lineTo(x(grid.at(-1)),p.t+ph);ctx.closePath();ctx.fill();
    strokeCurve(ctx,measuredFlux,x,y,"#f28b45",1.2,.9);
    curves.forEach((curve,i)=>strokeCurve(ctx,curve,x,y,i===state.activeSpectrum||curves.length===1?"#2156d9":"#9cabc3",i===state.activeSpectrum||curves.length===1?2.2:1.2,i===state.activeSpectrum||curves.length===1?1:.6));
    if(state.showReference)strokeCurve(ctx,reference,x,y,"#06aebd",1.8,.9);
  });
  if(state.source==="absorption"){
    ctx.save();ctx.font="9px system-ui";ctx.fillStyle="#7b8795";ctx.strokeStyle="#aeb7c3";ctx.setLineDash([2,3]);
    ABSORPTION_LINES.filter(line=>line.nm>=state.xMin&&line.nm<=state.xMax).forEach(line=>{
      const xx=x(line.nm);ctx.beginPath();ctx.moveTo(xx,p.t);ctx.lineTo(xx,p.t+ph);ctx.stroke();
      ctx.save();ctx.translate(xx+3,p.t+12);ctx.rotate(-Math.PI/2);ctx.fillText(line.label,0,0);ctx.restore();
    });
    ctx.restore();
  }
  ctx.save();ctx.translate(13,H/2);ctx.rotate(-Math.PI/2);ctx.fillStyle="#748093";ctx.fillText(state.axisMode==="lambda"?"Fluxo Fλ (escala linear)":"Fluxo Fν (Jy, escala linear)",state.axisMode==="lambda"?-48:-58,0);ctx.restore();
  canvas.onmousemove=e=>{
    const r=canvas.getBoundingClientRect(),fraction=(e.clientX-r.left-p.l)/pw;
    if(fraction<0||fraction>1)return $("tooltip").hidden=true;
    const nu=nuMax-fraction*(nuMax-nuMin);
    const l=Math.round(state.axisMode==="lambda"?state.xMin+fraction*(state.xMax-state.xMin):C.c*1e-3/nu);
    if(l<state.xMin||l>state.xMax)return $("tooltip").hidden=true;
    const i=l-GRID_MIN,t=$("tooltip"),coordinate=state.axisMode==="lambda"?`${l} nm`:`${(C.c*1e-3/l).toFixed(1)} THz`;
    t.hidden=false;t.style.left=`${e.clientX-r.left+12}px`;t.style.top=`${Math.max(5,e.clientY-r.top-30)}px`;
    t.innerHTML=`${coordinate}<br>${state.axisMode==="lambda"?"Fλ":"Fν"} ${formatSci(activeFlux[i])}${state.axisMode==="nu"?" Jy":""}<br>${state.axisMode==="lambda"?"S(λ)":"S(ν)"} ${response[i].toFixed(3)}`;
  };
  canvas.onmouseleave=()=>{$("tooltip").hidden=true};
}
function drawTransmissionChart(id,curves,color,active=0,fill=false){
  const {ctx,W,H}=setupCanvas(id),p={l:57,r:34,t:10,b:28};
  const visibleMax=Math.max(...curves.flatMap(visibleValues),0),max=visibleMax>0?visibleMax:1;
  const {ph,x}=axes(ctx,W,H,p,true,max),y=v=>p.t+ph-clamp(v/max)*ph;
  withPlotClip(ctx,p,W,H,()=>curves.forEach((curve,i)=>{
    if(fill&&i===active){ctx.save();ctx.globalAlpha=.13;ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(x(state.xMin),y(0));curve.forEach((v,j)=>ctx.lineTo(x(grid[j]),y(v)));ctx.lineTo(x(state.xMax),y(0));ctx.fill();ctx.restore()}
    strokeCurve(ctx,curve,x,y,i===active?color:"#aab3bf",i===active?2:1.2,i===active?1:.55);
  }));
}
function drawCharts(flux,parts,response){
  drawSpectralStrip("sourceColorChart",flux,response,false);
  drawSpectrumChart(flux,response);
  drawSpectralStrip("transmittedColorChart",flux,response,true);
  drawTransmissionChart("totalChart",[response],"#f28b45",0,true);
  if(state.mode==="components"){
    const filterCurves=state.params.shape==="file"&&state.filters.length?state.filters.map(f=>grid.map(x=>interp(f.data,x))):[parts[0]];
    drawTransmissionChart("filterChart",filterCurves,"#e47b31",state.params.shape==="file"?state.activeFilter:0,true);
    if($("instrumentEnabled").checked)drawTransmissionChart("instrumentChart",[instResponse(true)],"#805ad5",0,true);
    if($("atmosphereEnabled").checked)drawTransmissionChart("atmosphereChart",[atmoResponse(true)],"#25a878",0,true);
    if($("detectorEnabled").checked)drawTransmissionChart("detectorChart",[detResponse(true)],"#d94778",0,true);
  }
}

document.querySelectorAll("[data-mode]").forEach(button=>button.onclick=()=>setMode(button.dataset.mode));
document.querySelectorAll(".source-tab").forEach(b=>b.onclick=()=>{
  state.source=b.dataset.source;document.querySelectorAll(".source-tab").forEach(x=>x.classList.toggle("active",x===b));
  $("blackbodyControls").hidden=!["blackbody","absorption"].includes(state.source);
  $("absorptionControls").hidden=state.source!=="absorption";
  $("fileControls").hidden=state.source!=="file";calculate();
});
document.querySelectorAll("[data-axis]").forEach(b=>b.onclick=()=>{
  state.axisMode=b.dataset.axis;
  document.querySelectorAll("[data-axis]").forEach(x=>x.classList.toggle("active",x===b));
  calculate();
});
document.querySelectorAll("[data-photometric-system]").forEach(b=>b.onclick=()=>{
  state.photometricSystem=b.dataset.photometricSystem;
  document.querySelectorAll("[data-photometric-system]").forEach(x=>x.classList.toggle("active",x===b));
  calculate();
});
$("referenceToggle").onclick=()=>{
  state.showReference=!state.showReference;
  $("referenceToggle").textContent=state.showReference?"Ocultar referência":"Mostrar referência";
  $("referenceToggle").setAttribute("aria-pressed",String(state.showReference));
  $("referenceLegendItem").hidden=!state.showReference;
  calculate();
};
function updateAxisRange(){
  let min=clamp(+$("axisMin").value,GRID_MIN,GRID_MAX-1);
  let max=clamp(+$("axisMax").value,GRID_MIN+1,GRID_MAX);
  if(min>=max){
    if(document.activeElement===$("axisMin"))min=max-1;
    else max=min+1;
  }
  state.xMin=min;state.xMax=max;
  $("axisMin").value=min;$("axisMax").value=max;
  calculate();
}
$("axisMin").addEventListener("change",updateAxisRange);
$("axisMax").addEventListener("change",updateAxisRange);
["temperature","radius","distance","lineDepth","lineWidth"].forEach(id=>$(id).addEventListener("input",()=>{
  $("tempOut").textContent=(+$("temperature").value).toLocaleString("pt-BR")+" K";
  $("lineDepthOut").textContent=$("lineDepth").value+"%";$("lineWidthOut").textContent=$("lineWidth").value+" nm";calculate();
}));
["atmosphereEnabled","instrumentEnabled","detectorEnabled"].forEach(id=>$(id).onchange=calculate);
["atmosphereShape","instrumentShape","detectorShape"].forEach(id=>$(id).onchange=e=>{
  const kind=id.replace("Shape","");
  state.componentParams[kind].shape=e.target.value;
  state.fileNames[kind]="";
  $(kind==="atmosphere"?"atmoFileLabel":kind==="instrument"?"instFileLabel":"detFileLabel").hidden=e.target.value!=="file";
  componentControls(kind);calculate();
});
$("filterShape").onchange=e=>{state.realBand=null;state.params.shape=e.target.value;filterControls();calculate()};
bindMultipleFiles("spectrumFile","spectrum");bindMultipleFiles("filterFile","filter");
bindComponentFile("atmosphereFile","atmosphere");bindComponentFile("instrumentFile","instrument");bindComponentFile("detectorFile","detector");
$("loadRubinAtmosphere").onclick=()=>loadExampleCurve("atmosphere","Curvas_Reais/Rubin/atmosfera_rubin_x1.2.csv","Rubin · atmosfera X = 1,2");
$("loadRubinInstrument").onclick=()=>loadExampleCurve("instrument","Curvas_Reais/Rubin/instrumento_optico_rubin.csv","Rubin · 3 espelhos + 3 lentes");
$("loadRubinDetector").onclick=()=>loadExampleCurve("detector","Curvas_Reais/Rubin/detector_lsstcam.csv","Rubin · detector LSSTCam");
$("spectrumSelect").onchange=e=>activateCollection("spectrum",e.target.value);
$("filterSelect").onchange=e=>activateCollection("filter",e.target.value);
$("loadGaiaSpectrum").onclick=async()=>{try{
  const name="Gaia 2341866690928009216";
  let index=state.spectra.findIndex(s=>s.name===name);
  if(index<0){const text=await loadText("Espectros/Gaia/gaia_spectra_2341866690928009216.csv");state.spectra.push({name,data:parseTwoColumns(text,1,false)});index=state.spectra.length-1}
  activateCollection("spectrum",index);
}catch{$("spectrumStatus").textContent="Abra via servidor local para usar o atalho; ou selecione o arquivo manualmente."}};
document.querySelectorAll("[data-gaia]").forEach(b=>b.onclick=async()=>{
  try{const band=b.dataset.gaia,name=`Gaia ${band}`;let index=state.filters.findIndex(f=>f.name===name);
    if(index<0){const text=await loadText(`Filtros/GAIA_GAIA3.${band}.dat`);state.filters.push({name,data:parseTwoColumns(text,.1,true),band});index=state.filters.length-1}
    document.querySelectorAll("[data-gaia]").forEach(x=>x.classList.toggle("active",x===b));activateCollection("filter",index);
  }catch{alert("Abra a atividade por um servidor local para usar os atalhos Gaia.")}
});
$("resetBtn").onclick=reset;window.addEventListener("resize",calculate);
filterControls();["atmosphere","instrument","detector"].forEach(componentControls);setMode("components");
loadText("Espectros/Vega/vega_calspec.csv").then(text=>{state.vegaSpectrum=parseTwoColumns(text,1,false);calculate()});
