const express      = require('express');
const expressWS    = require('express-ws');

const cookieParser = require('cookie-parser');
const bodyParser   = require('body-parser');
const crypto       = require('crypto');
const path         = require("path");
const fs           = require("fs");

function cookieFilter(options) {
  
    const defaultOpts = {
      secrets : [ "jVkhB7Z5JCtBNRgfQ2v7DXiREE3SqsdIhg76qewyZPMqa1Qg8sQn1qjA8gptp9D" ],
      cookieOptions:{
        path : "/"
      },
      cookieNames : {
        permit  : "permitCookies",
        session : "sessionId"
      },
      agree_value : "yes",
      sessionIdLength : 48,
      noCookiesFile : path.join(__dirname,"..","views","nocookies.html"),
      
      staleCheckMsec : 90 * 1000,
      expireSessionsAfter : 24 * 60 * 60 * 1000,//24 hours,
      
      requestVarNames : {
        
        app_session_id : "app_session_id",
        app_session    : "app_session"
      }
      
    };
  
    options = options || defaultOpts;
    const mainApp       = options.app ? options.app : express();
  
    const cookieSecrets = options.secrets || defaultOpts.secrets;
    const cookieOptions = options.cookieOptions || defaultOpts.cookieOptions;
  
    const c_permit_cookies = options.cookieNames && 
                          options.cookieNames.permit ? 
                          options.cookieNames.permit : 
                          defaultOpts.cookieNames.permit;
  
    const c_session_id    = options.cookieNames && 
                            options.cookieNames.session ? 
                            options.cookieNames.session : 
                            defaultOpts.cookieNames.session;
  
    const v_session_id  = options.requestVarNames && 
                          options.requestVarNames.app_session_id ? 
                          options.requestVarNames.app_session_id : 
                          defaultOpts.requestVarNames.app_session_id;
  
    const v_session  = options.requestVarNames && 
                          options.requestVarNames.app_session ? 
                          options.requestVarNames.app_session : 
                          defaultOpts.requestVarNames.app_session;
  
    const agree_value   = options.agree_value || defaultOpts.agree_value;
  
  
    const sessionIdLength =  options.sessionIdLength || defaultOpts.sessionIdLength;
  
    const noCookiesFile  = options.noCookiesFile || defaultOpts.noCookiesFile;
    const noCookiesFileExists = fs.existsSync(noCookiesFile);
  
  
      // every 90 seconds, cull any sessions not used for 24 hours
    const staleCheckMsec = options.staleCheckMsec || defaultOpts.staleCheckMsec;
    const expireSessionsAfter = options.expireSessionsAfter || defaultOpts.expireSessionsAfter;
    let lastStaleCheck=false;
  
  
    const registeredApps = {
      default : express()
      
    };
  
    const data_path =   path.join(path.dirname(process.mainModule.filename),".data/");
    const sessionfile = data_path+"sessions.json";
    const activeSessions = fs.existsSync(sessionfile) ? JSON.parse(fs.readFileSync(sessionfile)): {};  
    const saveSessions = function(cb) {
      lastStaleCheck=undefined;
      removeStaleSessions(undefined,undefined,function(){
          fs.mkdir(data_path,function(){
            fs.writeFile(sessionfile,JSON.stringify(activeSessions),cb);
          });
      });
      
    };  
  
  
    // middleware to parse cookies previously set by server or browser
    // and load them into req.cookies
    mainApp.use(cookieParser(cookieSecrets, cookieOptions));
  
    
    // middleware to check for the session cookie, or make one but only if previously a 
    // permitCookies cookie was set to indicate they agree to use cookies
    // if succesful, req.sid
    mainApp.use(sessionCookie);
  
    // remove any apps not active for 24 hours.
    // (we do this AFTER having set the current req's session, so as to not 
    //  accidentally remove it's session - the atime will have been refreshed )
    mainApp.use(removeStaleSessions);
  
    mainApp.use(useFilteredApp);
  
    function sessionCookie (req,res,next) {
        const when = Date.now();
      
        if (req.cookies[ c_permit_cookies ]=== agree_value ) {
          
          // at some point in the past user as set a permit cookies cookie.
          // we are free to set whatever cookies we like. 
          let sid_ = req.cookies[ c_session_id ];
          
          if ( ! (typeof sid_ === 'string' && sid_.length===sessionIdLength) ) {
            
             sid_ = crypto
                .randomBytes(sessionIdLength*2)// a lot more than we need
                .toString('base64')//to base64 (makes it even longer!)
                .replace(/\=|\+|\//g,'')// lose a few unwanted chars ... "=",  "/",  "+"
                .substr(0,sessionIdLength);// just the first sessionIdLength chars
           
            res.cookie(c_session_id, sid_,{
                maxAge :  90 * 24 * 60 * 60 * 1000,
                path : "/",
                httpOnly:true
            }); 
          }
          
          let session = activeSessions[ sid_ ] ;
          
          if (session) {
            // update last access time for this session
            session.atime = when;
          } else {
            // create a new session var holder, flag it's create, access and modification times
            session = {
              app : "default",
              ctime : when,
              mtime : when,
              atime : when
            };
            activeSessions[ sid_ ] = session ;
          }
          
          // assign the session id and session for use by later middleware(s)
          req[ v_session_id ] = sid_;
          req[ v_session ] = session;
          
          console.log( sid_,req.method,req.url,"running",session.app,"app" );
          next();
       } else {
          // we can't proceed at all unless user has explicitly set a permit cookies cookie.
          if (noCookiesFileExists) {
             // best case optimised (fast) version - send pre validated no cookies file
             res.sendFile(noCookiesFile);
          } else {
             // if noCookiesFile wasn't there at module load do one last disk check and 
             // then just send hard coded ugly version
             fs.stat(noCookiesFile,function(err,stat){
               if (stat) {
                 res.sendFile(noCookiesFile);
               } else {
                 res.type("html");
                 res.send(hardCodedNoCookies());
               }
             });
          }
       }
    }
   
    function removeStaleSessions(req,res,next) {
      const when = Date.now();
      if (!lastStaleCheck || when > lastStaleCheck+staleCheckMsec) {
        const ids = Object.keys(activeSessions);
        if (ids.length>0) {
          lastStaleCheck=when;
          const expireBefore = when - expireSessionsAfter;
          const checkId = function (i) {
             if (i<ids.length) {
               const sess = activeSessions [ ids[i] ];
               if (sess.atime<expireBefore) {
                 delete activeSessions [ ids[i] ];
               } 
               // keep the lastStaleCheck current until the end of the loop
               // 90 seconds later, it's safe to check again.
               lastStaleCheck=Date.now();
               setImmediate(checkId,i+1);
             } else {
               
                if (!res) next();
               
             }
          };
          setImmediate(checkId,0);
        }
      }
      if (res) next();
    } 
  
    function switchApp(app_name,req,res,next) {
       console.log("switchApp("+app_name+")")
       const session = req[ v_session ];

       if (session) {
         
         const filtererApp = registeredApps [ app_name ];
        
         if (typeof filtererApp==='function') {
           
            session.app  = app_name;
            session.mtime = Date.now();
            console.log("switching to",app_name,"saving sessions")
            return saveSessions(function(){
              console.log("invoking handler now");
               return filtererApp(req,res,next);
            });
           
         } else {
           console.log(app_name,"is a",typeof filtererApp,"can't switchApp");
         }
        
       } else {
         
         console.log("no session information, id is ", req[ v_session_id ]);
       }
      
      
       if (typeof next==='function') {
           next();
       } else {
           res.status(404).send("not found");
       }

    }
  
    function useFilteredApp(req,res,next) {
      
      const session = req[ v_session ];
             
      if (session) {
        
         if (typeof session.app === 'string') {
             const filtererApp = registeredApps [ session.app ];

             if (typeof filtererApp==='function') {
                filtererApp(req,res,next);
             } else {
                console.log("app",session.app,"is not registered (",typeof filteredApp," in registeredApps[])")
                next();
             }
          
         } else {
             console.log("app missing in session object",req.url, req[ v_session_id ]);
             next()
         };
        
       } else {
         console.log("session missing in req object",req.url);
         next();
       }
    }
  
    
    function registerApp(app_name, app){
      if (typeof app==='function' &&  app_name!=="default") {
         console.log("registering app:",app_name);
         registeredApps [app_name] = app;
      } else {
        console.log("could not register app:",app_name,typeof app);
      }
    }
  
    function unregisterApp (app_name) {
       if (app_name!=="default") {
         delete  registeredApps [app_name] ;
       }
    }
  
  
    // returns an array of current sessions for a given registered app
  
    function getAppSessions(app_name,max_msec) {
       if (typeof registeredApps [app_name]  === 'function') {
          const ok_after = typeof max_msec === 'number' ? Date.now() - max_msec : 0; 
          return Object.keys(activeSessions).filter(function(id) {
             const sess =  activeSessions[id];
             return sess.app===app_name && sess.atime > ok_after;
         }).map(function(id){
            return activeSessions[id];
         });
       } else {
         return [];
       }
    }
  
 function on_server (server) {
   Object.keys(registeredApps).forEach(function(app_name){
     const fn = registeredApps[app_name].__on_server;
     if (typeof fn==='function') {
        console.log("invoking __on_server for",app_name);
        fn(server);
     }
   });
 }
  
 function on_listener (listener) {
   Object.keys(registeredApps).forEach(function(app_name){
     const fn = registeredApps[app_name].__on_listener;
     if (typeof fn==='function') {
        console.log("invoking __on_listener for",app_name);
        fn(listener);
     }
   });
 }

  
  return {
    express          : express,
    app              : mainApp,
    registerApp      : registerApp,
    unregisterApp    : unregisterApp,
    defaultApp       : registeredApps.default,
    getAppSessions   : getAppSessions,
    switchApp        : switchApp,
    urlencodedParser : bodyParser.urlencoded({ extended: false }),
    data_path        : data_path,
    on_server        : on_server,
    on_listener      : on_listener
  };
  
  
      function hardCodedNoCookies(){ 
      return `
<html><head><title>Please agree to use cookies</title></head>
<body>
<h1>Please agree to use cookies</h1>
<button onclick="agreeClick()">I agree to use cookies</button>
<pre></pre>
<script>
function agreeClick(){
  eraseAllCookies();
  createCookie("${c_permit_cookies}","${agree_value}",90);
  if (readCookie("${c_permit_cookies}")==="${agree_value}" ) {
     location.reload();
  } else {
    document.querySelector("pre").innerHTML = "cookie:"+document.cookie;
  }
}

function readCookie(name) {
    var nameEQ = name + "=";
    var ca = document.cookie.split(';');
    for(var i=0;i < ca.length;i++) {
        var c = ca[i];
        while (c.charAt(0)==' ') c = c.substring(1,c.length);
        if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length,c.length);
    }
    return null;
}


function createCookie(name, value, days) {
  if (days) {
    var date = new Date();
    date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
    var expires = "; expires=" + date.toGMTString();
  } else var expires = "";
  document.cookie = name + "=" + value + expires + "; path=/";
}

function eraseCookie(name) {
  createCookie(name, "", -1);
}

function eraseAllCookies() {
  var cookies = document.cookie.split(";");
  for (var i = 0; i < cookies.length; i++)
    eraseCookie(cookies[i].split("=")[0]);
}


</script>
</body>
</html>`;
    };  



}
 
module.exports = cookieFilter;
