function signinTemplate({afterSignin_URI="/",
                         afterSignin_App_Name="app1",
                         afterSignin_App,
                         signup_template,
                         signin_template,
                         exists_template,
                         auth_fail_template}) {
    const fs = require('fs');
    const crypto = require('crypto');
    const { express , 
            app, 
            registerApp, 
            unregisterApp,
            defaultApp,
            getAppSessions,
            switchApp,
            urlencodedParser,
            data_path,
            on_server,        
            on_listener      
          } = require("./index.js")();

    const ufile = data_path+"users.json";
    const users = fs.existsSync(ufile) ? JSON.parse(fs.readFileSync(ufile)): {};
    const saveUsers = function(cb) {
      fs.mkdir(data_path,function(){
        fs.writeFile(ufile,JSON.stringify(users),cb);
      });
    };

    const app_names = {
      signup       : "signup",
      signin       : "signin",
      after_signin : afterSignin_App_Name || "app1"
    };
  
    const app_uris = {
      signup       : "/signup",
      exists       : "/exists",
      
      signin       : "/signin",
      signout      : "/signout",
      auth_fail    : "/auth_fail",
      after_signin : afterSignin_URI || "/"
    };
  
  
    const app_templates = {
      signup : signup_template || [`
<html>
  <body>
  <h1>Register</h1>
  <form action="${app_uris.signup}" method="post">
    <p>
      <label>
      username
      <input name="user" value="" \>
      </label>
    </p>

    <p>
      <label>
      choose a password
      <input type="password" value="" \>
      </label>
    </p>

    <p>
      <label>
      repeated password
      <input type="password" value="" \>
      </label>
    </p>


    <input type="submit" value="sign up"\>
    <input type="hidden" name= "payload" value=""\>
  </form>
  <script>

  const qs = document.querySelector.bind(document);
  const qsa = document.querySelectorAll.bind(document);
  qs('input[type="submit"]').addEventListener("click",function(e) {
    const ps = qsa('input[type="password"]');
    const pass1 = ps[0].value;
    const pass2 = ps[1].value;
    const u  = qs('input');
    const user = u.value; 
    const payload = qs('input[type="hidden"]');
    if (pass1!==pass2) { 
       e.preventDefault();
       alert ("passwords don't match");
    } else {
       payload.value=btoa(JSON.stringify({u:user,p:pass1}));
       ps[0].value="";
       ps[1].value="";
       u.value="";
    }    
  });

  </script>
  <p>already have an account? <a href="${app_uris.signin}">sign in</a> now</p>
</body>
</html>`],
      exists : exists_template || [
          `
        <html>
        <body>
        <h1>that username exists</h1>
        <a href="${app_uris.signup}"><button>try again</button></a>
        </body>
        </html>
           `
      ],
      signin : signin_template || [
    `<html>
<body>
<h1>Sign In</h1>
 <form action="${app_uris.signin}" method="post">
  <p>
    <label>
    user
    <input type="text" name="user" value="`,`" \>
    </label>
  </p>

  <p>
    <label>
    password
    <input type="password" name="pass" value="" \>
    </label>
  </p>

  <input type="submit" value="sign in"\>
  <input type="hidden" name= "payload" value=""\>
</form>

<script>

const qs = document.querySelector.bind(document);
qs('input[type="submit"]').addEventListener("click",function(e) {
  const ps = qs('input[type="password"]');
  const pass1 = ps.value;
  const u  = qs('input');
  const user = u.value; 
  const payload = qs('input[type="hidden"]');
   payload.value=btoa(JSON.stringify({u:user,p:pass1}));
   ps.value="";
   u.value="";
});

</script>
<p>no account? <a href="${app_uris.signup}">sign up</a> now</p>
</body>
</html>`],      
      auth_fail : auth_fail_template|| [
`<html>
<body>
<h1>login failed</h1>
<a href="${app_uris.signin}"><button>try again</button></a>
</body>
</html>`

      ]
      
    };
  
    defaultApp.get("/",function(req,res){ switchApp(app_names.signin,req,res); });

    function app1(){

      const app1_page = express();
      app1_page.get("/",function(req,res){
         res.type("html");
         res.send(`
      <html>
        <body>
        <h1>Signed in</h1>
        <a href="${app_uris.signout}"><button>sign out</button></a>
      </body>
      </html>
      `)
      });

      app1_page.get(app_uris.signout,function(req,res){
        delete req.app_session.logged_in;
        switchApp(app_names.signin,req,res);
      });

      app1_page.get("*",function(req,res){
        res.redirect(app_uris.after_signin);
      });

      return app1_page;
    }

    function signupApp() {

      const register_page = express();

      register_page.get(app_uris.signup,function(req,res){
         delete req.app_session.logged_in;
         res.type("html");
         res.send(app_templates.signup[0]);
      });

      register_page.post(app_uris.signup,urlencodedParser,function(req,res){
        const {u,p} = JSON.parse(Buffer.from(req.body.payload,'base64'));

        if (users[u]) {

          res.redirect(app_uris.exists);

        } else {
          users[u]=crypto.createHash("sha256").update(p).digest("hex");

          saveUsers(function(){
            req.app_session.user=u;
            switchApp(app_names.signin,req,res);
          });

        }

      });

      register_page.get(app_uris.exists,function(req,res){
         res.type('html');
         res.send(app_templates.exists[0]);
      });

      register_page.get(app_uris.signin,function(req,res){
        switchApp(app_names.signin,req,res);
      });

      register_page.all("*",function(req,res){ res.redirect(app_uris.signup);  });

      return register_page;
    }

    function signinApp() {

        const login_page = express();
        login_page.get(app_uris.signin,function(req,res){
           res.type("html");
           res.send(app_templates.signin.join(req.app_session.user?req.app_session.user:''))
        });

        login_page.post(app_uris.signin,urlencodedParser,function(req,res){

          const {u,p} = JSON.parse(Buffer.from(req.body.payload,'base64'));

          if (u && p && users[u]===crypto.createHash("sha256").update(p).digest("hex")) {

            req.app_session.logged_in = Date.now();
            req.app_session.user=u;
            req.app_session.app =app_names.after_signin; 
            res.redirect(app_uris.after_signin);
          } else {
            res.redirect(app_uris.auth_fail);
          }

        });

        login_page.get(app_uris.auth_fail,function(req,res){
           delete req.app_session.logged_in;
           res.type('html');
           res.send(app_templates.auth_fail[0]);
        });

        login_page.get(app_uris.signup,function(req,res){
          delete req.app_session.logged_in;
          switchApp(app_names.signup,req,res);
        });

        login_page.all("*",function(req,res){ res.redirect(app_uris.signin);   });

        return login_page;
    }


    registerApp(app_names.signup,signupApp() );
    registerApp(app_names.signin,signinApp() );
    registerApp(app_names.after_signin,afterSignin_App ? afterSignin_App : app1());
  
  app.__on_server   = on_server;
  app.__on_listener = on_listener;
  
  app.switchApp =  switchApp;

  return app;
}
  
module.exports =  signinTemplate;

