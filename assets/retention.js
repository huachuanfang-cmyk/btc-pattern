(function(root){
  'use strict';
  const CONSENT_KEY='btcBoxAnalyticsConsent';
  const RETENTION_KEY='btcBoxRetentionMilestones';
  const GA_ID='G-VCFSRS674P';
  let loading=null;

  function consent(){
    try{return localStorage.getItem(CONSENT_KEY)==='granted'?'granted':'denied';}catch(error){return'denied';}
  }
  function loadAnalytics(){
    if(consent()!=='granted') return Promise.resolve(false);
    if(root.gtag) return Promise.resolve(true);
    if(loading) return loading;
    root.dataLayer=root.dataLayer||[];
    root.gtag=function(){root.dataLayer.push(arguments);};
    root.gtag('js',new Date());
    root.gtag('config',GA_ID,{anonymize_ip:true,allow_google_signals:false,allow_ad_personalization_signals:false});
    loading=new Promise(resolve=>{
      const script=document.createElement('script');
      script.async=true;
      script.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(GA_ID);
      script.onload=()=>resolve(true);
      script.onerror=()=>resolve(false);
      document.head.appendChild(script);
    });
    return loading;
  }
  function setConsent(value){
    const next=value==='granted'?'granted':'denied';
    try{localStorage.setItem(CONSENT_KEY,next);}catch(error){}
    if(next==='granted') loadAnalytics();
    root.dispatchEvent(new CustomEvent('btcbox:analytics-consent',{detail:next}));
    return next;
  }
  function utcDate(){return new Date().toISOString().slice(0,10);}
  function dayDiff(from,to){return Math.max(0,Math.floor((Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000));}
  function queryBucket(count){return count<1?'0':count<3?'1-2':'3-5';}
  async function recordVisit(options={}){
    if(consent()!=='granted') return false;
    let state={firstDate:utcDate(),lastDate:null,sent:[]};
    try{state={...state,...JSON.parse(localStorage.getItem(RETENTION_KEY)||'null')};}catch(error){}
    const today=utcDate();
    if(state.lastDate===today) return false;
    const elapsed=dayDiff(state.firstDate,today);
    const milestone=elapsed>=30?'d30':elapsed>=7?'d7':elapsed>=1?'d1':'d0';
    state.lastDate=today;
    const shouldSend=!state.sent.includes(milestone);
    if(shouldSend) state.sent.push(milestone);
    try{localStorage.setItem(RETENTION_KEY,JSON.stringify(state));}catch(error){}
    if(!shouldSend || !(await loadAnalytics()) || !root.gtag) return false;
    root.gtag('event','retention_milestone',{
      milestone,
      installed:options.installed?'yes':'no',
      saved_query_bucket:queryBucket(Number(options.savedCount)||0),
      data_fresh:options.latestDate===today?'same_day':'completed_daily'
    });
    return true;
  }
  root.BtcBoxPrivacy={consent,setConsent,loadAnalytics,recordVisit};
  if(consent()==='granted') loadAnalytics();
})(typeof window!=='undefined'?window:this);
