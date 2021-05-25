# app-cookie-filter

allows seperate apps to be switched in and out per user, based on session cookie.

(not shown in this demo (as there is only 1 app), but back end can determin what apps user has access to, by issuing switchApp() )

see https://secure-json-editor.glitch.me/signin for a working demo


(relevant code from the above glitch demo...)

**server.js**

```js
const express = require("express");
const path = require("path");  
const app = require("./server/app")(express);
require ("server-startup")(app,express);         

```

**server/app.js**

```js

const fs = require('fs');   
const path = require('path');  
const sha256Node = require ('sha256'), { sha256 } = sha256Node;  

module.exports = function (express) {
   
  const app = express();
  const secureJSON = require("glitch-secure-json"); 
  const secureJSONEditor = require("glitch-secure-json-edit");
   
  sha256Node.express(app,express);// for <script src="/sha256.js"></script>
 
  const route = '/edit/object'; 
  const displayName = "the Object";
  const filename = '/app/config/settings.json';
  const obj = { aString:'hello world',aNumber:42};
  const theme = "chaos";
  const template = { 
    aString:'',aNumber:0 
  };     
 
   if (!fs.existsSync(filename)){
    fs.writeFileSync(filename,secureJSON.stringify(obj));
  }
  
  app.__on_server = function(server) {
       
       const editor = secureJSONEditor(app,express,server,filename,displayName,template,route,theme);
  };
  

app.get("/", function (request, response) { 
  response.sendFile(path.join(__dirname,"views","index.html"));    
});  
 
app.get("/signin", function (request, response) { 
  request.app_session.app="edit_object";
  response.sendFile(path.join(__dirname,"views","index.html"));    
});   
  
const filterapp = require('app-cookie-filter/app-filter-demo.js')({
  afterSignin_URI:"/edit/object",
  afterSignin_App_Name:"edit_object",
  afterSignin_App:app,
  signup_template:undefined,
  signin_template:undefined,
  exists_template:undefined,
  auth_fail_template:undefined});
 
  filterapp.get("/signout", function (request, response) { filterapp.switchApp("signin",request,response);  });    
 
  return filterapp;
  
}


```

**package.json**

```json

{
  "//1": "describes your app and its dependencies",
  "//2": "https://docs.npmjs.com/files/package.json",
  "//3": "updating this file will download and update your packages",
  "name": "secure-json",
  "version": "0.0.1",
  "description": "A simple Node app built on Express, instantly up and running.",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.17.1",
    "bufferutil": "^4.0.1",
    "server-startup": "github:jonathan-annett/server-startup#4c7b25a20bd5370d94a3dc6f1e7a7cd8768ad478",
    "glitch-secure-json-edit": "github:jonathan-annett/glitch-secure-json-edit#4275ee555df07eadccc3244225a15ca50cb72a71",
    "app-cookie-filter": "https://github.com/jonathan-annett/app-cookie-filter#928a3c3329a3accd5cf4187ffed1d76e183d88cf"
  },
  "engines": {
    "node": "12.x"
  },
  "repository": {
    "url": "https://glitch.com/edit/#!/glitch-secure-json"
  },
  "license": "MIT",
  "keywords": [
    "node",
    "glitch",
    "express"
  ]
}

```
