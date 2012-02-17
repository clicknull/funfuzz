/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is jsfunfuzz.
 *
 * The Initial Developer of the Original Code is
 * Jesse Ruderman.
 * Portions created by the Initial Developer are Copyright (C) 2006-2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 * Gary Kwong
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

//"use strict";
var jsStrictMode = false;



/********************
 * ENGINE DETECTION *
 ********************/

// jsfunfuzz is best run in a command-line shell.  It can also run in
// a web browser, but you might have trouble reproducing bugs that way.

var ENGINE_UNKNOWN = 0;
var ENGINE_SPIDERMONKEY_TRUNK = 1; // also 1.9.1 and tracemonkey branch
var ENGINE_JAVASCRIPTCORE = 4;

var engine = ENGINE_UNKNOWN;
var jsshell = (typeof window == "undefined");
var dump;
var dumpln;
var printImportant;
if (jsshell) {
  dumpln = print;
  printImportant = function(s) { dumpln("***"); dumpln(s); }
  if (typeof line2pc == "function") {

    if (typeof snarf == "function") {
      engine = ENGINE_SPIDERMONKEY_TRUNK;
    }

    version(180); // 170: make "yield" and "let" work. 180: sane for..in.
  } else if (typeof XPCNativeWrapper == "function") {
    // e.g. xpcshell
    engine = ENGINE_SPIDERMONKEY_TRUNK;
  } else if (typeof debug == "function") {
    engine = ENGINE_JAVASCRIPTCORE;
  }
} else {
  if (navigator.userAgent.indexOf("WebKit") != -1) {
    engine = ENGINE_JAVASCRIPTCORE;
    // This worked in Safari 3.0, but it might not work in Safari 3.1.
    dump = function(s) { console.log(s); }
  } else if (navigator.userAgent.indexOf("Gecko") != -1) {
    engine = ENGINE_SPIDERMONKEY_TRUNK;
  } else if (typeof dump != "function") {
    // In other browsers, jsfunfuzz does not know how to log anything.
    dump = function() { };
  }
  dumpln = function(s) { dump(s + "\n"); }

  printImportant = function(s) {
    dumpln(s);
    var p = document.createElement("pre");
    p.appendChild(document.createTextNode(s));
    document.body.appendChild(p);
  }
}

if (typeof gc == "undefined")
  gc = function(){};

var haveE4X = (typeof XML == "function");
if (haveE4X)
  XML.ignoreComments = false; // to make uneval saner -- see bug 465908

var HOTLOOP = "tracemonkey" in this ? tracemonkey.HOTLOOP : 8;

function simpleSource(s)
{
  function hexify(c)
  {
    var code = c.charCodeAt(0);
    var hex = code.toString(16);
    while (hex.length < 4)
      hex = "0" + hex;
    return "\\u" + hex;
  }

  if (typeof s == "string")
    return "\"" + s.replace(/\\/g, "\\\\")
                   .replace(/\"/g, "\\\"")
                   .replace(/\0/g, "\\0")
                   .replace(/\n/g, "\\n")
                   .replace(/[^ -~]/g, hexify) // not space (32) through tilde (126)
                   + "\"";
  else
    return "" + s; // hope this is right ;)  should work for numbers.
}

var haveRealUneval = (typeof uneval == "function");
if (!haveRealUneval)
  uneval = simpleSource;

if (engine == ENGINE_UNKNOWN)
  printImportant("Targeting an unknown JavaScript engine!");
else if (engine == ENGINE_SPIDERMONKEY_TRUNK)
  printImportant("Targeting SpiderMonkey / Gecko (trunk).");
else if (engine == ENGINE_JAVASCRIPTCORE)
  printImportant("Targeting JavaScriptCore / WebKit.");

function printAndStop(s, happy)
{
  printImportant(s);
  if (jsshell) {
    print(happy ? "It's looking good!" : "jsfunfuzz stopping due to above error!"); // Magic strings that jsunhappy.py look for
    quit();
  }
}

function errorToString(e)
{
  try {
    return ("" + e);
  } catch (e2) {
    return "Can't toString the error!!";
  }
}


/***********************
 * AVOIDING KNOWN BUGS *
 ***********************/

function whatToTestSpidermonkeyTrunk(code)
{
  return {

    allowParse: true,

    // Exclude things here if decompiling the function causes a crash.
    allowDecompile: true,

    // Exclude things here if decompiling returns something bogus that won't compile.
    checkRecompiling: true
      && !( code.match( /\..*\@.*(this|null|false|true).*\:\:/ ))  // avoid bug 381197
      && !( code.match( /arguments.*\:\:/ ))       // avoid bug 355506
      && !( code.match( /\:.*for.*\(.*var.*\)/ ))  // avoid bug 352921
      && !( code.match( /\:.*for.*\(.*let.*\)/ ))  // avoid bug 352921
      && !( code.match( /for.*let.*\).*function/ )) // avoid bug 352735 (more rebracing stuff)
      && !( code.match( /for.*\(.*\(.*in.*;.*;.*\)/ )) // avoid bug 353255
      && !( code.match( /const.*arguments/ ))        // avoid bug 355480
      && !( code.match( /var.*arguments/ ))          // avoid bug 355480
      && !( code.match( /let.*arguments/ ))          // avoid bug 355480
      && !( code.match( /let/ ))   // avoid bug 462309 :( :( :(
      && !( code.match( /\{.*\:.*\}.*\=.*/ ) && code.indexOf("const") != -1)    // avoid bug 492010
      && !( code.match( /\{.*\:.*\}.*\=.*/ ) && code.indexOf("function") != -1) // avoid bug 492010
      && !( code.match( /if.*function/ ) && code.indexOf("const") != -1)        // avoid bug 355980 *errors*
      && !( code.match( /switch.*default.*xml.*namespace/ ))  // avoid bug 566616
      && !( code.match( /\#.*=/ ))                 // avoid bug 568734
      ,

    // Exclude things here if decompiling returns something incorrect or non-canonical, but that will compile.
    checkForMismatch: true
      && !( code.match( /const.*if/ ))               // avoid bug 352985
      && !( code.match( /if.*const/ ))               // avoid bug 352985
      && !( code.match( /with.*try.*function/ ))     // avoid bug 418285
      && !( code.match( /if.*try.*function/ ))       // avoid bug 418285
      && !( code.match( /\{.*\}.*=.*\[.*\]/ ))       // avoid bug 646696
      && !( code.match( /\?.*\?/ ))                  // avoid bug 475895
      && !( code.match( /if.*function/ ))            // avoid bug 355980 *changes*
      && !( code.match( /\(.*\).*\(.*\)/ ))          // parenthesized callee expression (bug 646695, etc)
      && !( code.match( /new.*\(.*\)/ ))             // parenthesized callee expression (bug 646695, etc)
      && !( code.match( /\[.*\+/ ))        // constant folding bug 646599
      && (code.indexOf("*") == -1)         // constant folding bug 539819
      && (code.indexOf("/") == -1)         // constant folding bug 539819
      && (code.indexOf("#") == -1)         // avoid bug 646600
      && (code.indexOf("default") == -1)   // avoid bug 355509
      && (code.indexOf("delete") == -1)    // avoid bug 352027, which won't be fixed for a while :(
      && (code.indexOf("const") == -1)     // avoid bug 352985 and bug 355480 :(
      // at constant-folding time (?) away from strings
      &&
           (
             (code.indexOf("\"") == -1 && code.indexOf("\'") == -1)
             ||
             (
                  (code.indexOf("%")  == -1)
               && (code.indexOf("/")  == -1)
               && (code.indexOf("*")  == -1)
               && (code.indexOf("-")  == -1)
               && (code.indexOf(">>") == -1)
               && (code.indexOf("<<") == -1)
             )
          )
      ,

    // Exclude things here if the decompilation doesn't match what the function actually does
    checkDisassembly: true
      && !( code.match( /\@.*\:\:/ ))   // avoid bug 381197 harder than above
      && !( code.match( /for.*in.*for.*in/ ))   // avoid bug 475985
    ,

    checkForExtraParens: true
      && !code.match( /if.*\(.*=.*\)/)      // ignore extra parens added to avoid strict warning
      && !code.match( /while.*\(.*=.*\)/)   // ignore extra parens added to avoid strict warning
      && !code.match( /\?.*\=/)             // ignore bug 475893
    ,

    allowExec: unlikelyToHang(code)
      && code.indexOf("<>")       == -1 // avoid bug 334628, hopefully
      && (jsshell || code.indexOf("nogeckoex") == -1)
    ,

    allowIter: true,

    checkUneval: false // bug 539819
      // exclusions won't be perfect, since functions can return things they don't
      // appear to contain, e.g. with "return x;"
      && (code.indexOf("<") == -1 || code.indexOf(".") == -1)  // avoid bug 379525
      && (code.indexOf("<>") == -1)                            // avoid bug 334628
    ,

    expectConsistentOutput: true
       && code.indexOf("gc") == -1                  // gc is noisy in spidermonkey
       && code.indexOf("Date") == -1                // time marches on
    ,

    expectConsistentOutputAcrossIter: true
       && code.indexOf("options") == -1             // options() is per-cx, and the js shell doesn't create a new cx for each sandbox/compartment
    ,

    expectConsistentOutputAcrossJITs: true
       && code.indexOf("too_much_recursion") == -1  // recursion limits may differ (at least between execution modes). see bug 584594 (wontfix).
       && code.indexOf(".(") == -1                  // recursion limits & e4x operator that can get itself into infinite-recursion
       && code.indexOf("getOwnPropertyNames") == -1 // Object.getOwnPropertyNames(this) contains "jitstats" and "tracemonkey" exist only with -j
       && code.indexOf("instanceof") == -1          // bug 617949

  };
}



function whatToTestJavaScriptCore(code)
{
  return {

    allowParse: true,

    allowDecompile: true,

    checkRecompiling: true,

    checkForMismatch: true
      ,

    checkForExtraParens: false, // ?

    allowExec: unlikelyToHang(code)
      ,

    allowIter: false, // JavaScriptCore does not support |yield| and |Iterator|

    checkUneval: false, // JavaScriptCore does not support |uneval|

    expectConsistentOutput: false,
    expectConsistentOutputAcrossIter: false,
    expectConsistentOutputAcrossJITs: false

  };
}

function whatToTestGeneric(code)
{
  return {
    allowParse: true,
    allowDecompile: true,
    checkRecompiling: true,
    checkForMismatch: true,
    checkForExtraParens: false, // most js engines don't try to guarantee lack of extra parens
    allowExec: unlikelyToHang(code),
    allowIter: (typeof Iterator == "function"),
    checkUneval: haveRealUneval,
    expectConsistentOutput: false,
    expectConsistentOutputAcrossIter: false,
    expectConsistentOutputAcrossJITs: false
  };
}

var whatToTest;
if (engine == ENGINE_SPIDERMONKEY_TRUNK)
  whatToTest = whatToTestSpidermonkeyTrunk;
else if (engine == ENGINE_JAVASCRIPTCORE)
  whatToTest = whatToTestJavaScriptCore;
else
  whatToTest = whatToTestGeneric;


function unlikelyToHang(code)
{
  // Things that are likely to hang in all JavaScript engines
  return true
    && code.indexOf("infloop") == -1
    && !( code.match( /const.*for/ )) // can be an infinite loop: function() { const x = 1; for each(x in ({a1:1})) dumpln(3); }
    && !( code.match( /for.*const/ )) // can be an infinite loop: for each(x in ...); const x;
    && !( code.match( /for.*in.*uneval/ )) // can be slow to loop through the huge string uneval(this), for example
    && !( code.match( /for.*for.*for/ )) // nested for loops (including for..in, array comprehensions, etc) can take a while
    && !( code.match( /for.*for.*gc/ ))
    ;
}




/*************************
 * DRIVING & BASIC TESTS *
 *************************/

var allMakers = [];
function totallyRandom(d, b) {
  d = d + (rnd(5) - 2); // can increase!!

  return (rndElt(allMakers))(d, b);
}

function init(glob)
{
  for (var f in glob)
    if (f.indexOf("make") == 0 && typeof glob[f] == "function")
      allMakers.push(glob[f]);
}

/*
function testEachMaker()
{
  for each (var f in allMakers) {
    dumpln("");
    dumpln(f.name);
    dumpln("==========");
    dumpln("");
    for (var i = 0; i < 100; ++i) {
      try {
        dumpln(f(8, ["A", "B"]));
      } catch(e) {
        dumpln("");
        dumpln(uneval(e));
        dumpln(e.stack);
        dumpln("");
      }
    }
    dumpln("");
  }
}
*/

function start(glob)
{
  init(glob);

  count = 0;

  if (jsshell) {
    // If another script specified a "maxRunTime" argument, use it; otherwise, run forever
    var MAX_TOTAL_TIME = (glob.maxRunTime) || (Infinity);
    var startTime = new Date();

    do {
      testOne();
      var elapsed1 = new Date() - lastTime;
      if (elapsed1 > 1000) {
        print("That took " + elapsed1 + "ms!");
      }
      var lastTime = new Date();
    } while(lastTime - startTime < MAX_TOTAL_TIME);
  } else {
    setTimeout(testStuffForAWhile, 200);
  }
}

function testStuffForAWhile()
{
  for (var j = 0; j < 100; ++j)
    testOne();

  if (count % 10000 < 100)
    printImportant("Iterations: " + count);

  setTimeout(testStuffForAWhile, 30);
}

function testOne()
{
  var dumpEachSeed = false; // Can be set to true if makeStatement has side effects, such as crashing, so you have to reduce "the hard way".
  ++count;
  // Split this string across two source strings to ensure that if a
  // generated function manages to output the entire jsfunfuzz source,
  // that output won't match the grep command.
  var grepforme = "/*F";
  grepforme += "RC*/"

  // Sometimes it makes sense to start with simpler functions:
  //var depth = (~~(count / 1000)) & 16;
  var depth = 10;

  if (dumpEachSeed) {
    // More complicated, but results in a much shorter script, making SpiderMonkey happier.
    var MTA = uneval(rnd.fuzzMT.export_mta());
    var MTI = rnd.fuzzMT.export_mti();
    if (MTA != rnd.lastDumpedMTA) {
      dumpln(grepforme + "rnd.fuzzMT.import_mta(" + MTA + ");");
      rnd.lastDumpedMTA = MTA;
    }
    dumpln(grepforme + "rnd.fuzzMT.import_mti(" + MTI + "); void (makeOv(" + depth + "));");
  }

  var code = makeOv(depth);

//  if (rnd(10) == 1) {
//    var dp = "/*infloop-deParen*/" + rndElt(deParen(code));
//    if (dp)
//      code = dp;
//  }
  dumpln(grepforme + "count=" + count + "; tryItOut(" + uneval(code) + ");");

  tryItOut(code);
}

function makeOv(d, ignoredB)
{
  return maybeStrict() + makeStatement(d, ["x"]);
}

function failsToCompileInTry(code) {
  // Why would this happen? One way is "let x, x"
  try {
    new Function(" try { " + code + " } catch(e) { }");
    return false;
  } catch(e) {
    return true;
  }
}

function tryItOut(code)
{
  var c; // a harmless variable for closure fun

  // Accidentally leaving gczeal enabled for a long time would make jsfunfuzz really slow.
  if (typeof gczeal == "function")
    gczeal(0);

  // SpiderMonkey shell does not schedule GC on its own.  Help it not use too much memory.
  if (count % 1000 == 0) {
    dumpln("Paranoid GC (count=" + count + ")!");
    realGC();
  }

  // regexps can't match across lines, so replace whitespace with spaces.
  var codeWithoutLineBreaks = code.replace(/\s/g, " ");
  var wtt = whatToTest(codeWithoutLineBreaks);

  code = code.replace(/\/\*DUPTRY\d+\*\//, function(k) { var n = parseInt(k.substr(8), 10); dumpln(n); return strTimes("try{}catch(e){}", n); })

  if (!wtt.allowParse)
    return;

  if (primarySandbox) {
    if (wtt.allowExec) {
      try {
        Components.utils.evalInSandbox(code, primarySandbox);
      } catch(e) {
        // It might not be safe to operate on |e|.
      }
    }
    return;
  }

  try {
    Reflect.parse(code);
  } catch(e) {
  }

  if (count % 20 == 1) {
    if (wtt.allowExec) {
      try {
        print("Plain eval");
        eval(code);
      } catch(e) {
        print(errorToString(e));
      }
      tryEnsureSanity();
    }
    return;
  }

  var f;
  var compileMode;
  try {
    // Try two methods of creating functions, just in case there are differences.
    if (count % 2 == 0 && wtt.allowExec) {
      compileMode = "directEvalC";
      if (verbose)
        dumpln("About to compile, using eval hack.")
      f = directEvalC("(function(){" + code + "});"); // Disadvantage: "}" can "escape", allowing code to *execute* that we only intended to compile.  Hence the allowExec check.
    }
    else {
      compileMode = "newFun"
      if (verbose)
        dumpln("About to compile, using new Function.")
      if (jsStrictMode)
        code = "'use strict'; " + code; // ES5 10.1.1: new Function does not inherit strict mode
      f = newFun(code);
    }
  } catch(compileError) {
    dumpln("Compiling threw: " + errorToString(compileError));
  }

  optionalTests(f, code, wtt);

  if (f && wtt.allowDecompile) {
    tryRoundTripStuff(f, code, wtt);
    if (typeof disassemble == "function" && compileMode == "directEvalC" && wtt.checkRecompiling && wtt.checkForMismatch && wtt.checkDisassembly)
      checkRoundTripDisassembly(f, code, wtt);
  }

  if (f && wtt.allowExec && wtt.expectConsistentOutput && wtt.expectConsistentOutputAcrossJITs) {
    if (code.indexOf("\n") == -1 && code.indexOf("\r") == -1 && code.indexOf("\f") == -1 && code.indexOf("\0") == -1 && code.indexOf("\u2028") == -1 && code.indexOf("\u2029") == -1 && code.indexOf("<--") == -1 && code.indexOf("-->") == -1 && code.indexOf("//") == -1) {
      if (true) {
        // FCM cookie
        var cookie1 = "/*F";
        var cookie2 = "CM*/";
        var nCode = code;
        // Avoid compile-time errors because those are no fun.
        // But leave some things out of function(){} because some bugs are only detectable at top-level, and
        // pure jsfunfuzz doesn't test top-level at all.
        // (This is a good reason to use compareJIT even if I'm not interested in finding JIT bugs!)
        if (nCode.indexOf("return") != -1 || nCode.indexOf("yield") != -1 || nCode.indexOf("const") != -1 || failsToCompileInTry(nCode))
          nCode = "(function(){" + nCode + "})()"
        dumpln(cookie1 + cookie2 + " try { " + nCode + " } catch(e) { }");
      }
    }
  }

  var rv = null;
  if (wtt.allowExec && f) {
    rv = tryRunning(f, code);
    tryEnsureSanity();
  }

  if (wtt.allowIter && rv && typeof rv == "object") {
    tryIteration(rv);
    tryEnsureSanity();
  }

  if (f && wtt.allowExec && wtt.expectConsistentOutput && wtt.expectConsistentOutputAcrossIter) {
    nestingConsistencyTest(code);
    compartmentConsistencyTest(code);
  }

  // "checkRecompiling && checkForMismatch" here to catch returned functions
  if (wtt.checkRecompiling && wtt.checkForMismatch && wtt.checkUneval && rv && typeof rv == "object") {
    testUneval(rv);
  }

  if (verbose)
    dumpln("Done trying out that function!");

  dumpln("");
}

function nestingConsistencyTest(code)
{
  // Inspired by bug 676343
  // This only makes sense if |code| is an expression (or an expression followed by a semicolon). Oh well.
  function nestExpr(e) { return "(function() { return " + code + "; })()"; }
  var codeNestedOnce = nestExpr(code);
  var codeNestedDeep = code;
  var depth = rnd(5) + 14; // 16 might be special
  for (var i = 0; i < depth; ++i) {
    codeNestedDeep = nestExpr(codeNestedDeep);
  }

  var resultO = sandboxResult(codeNestedOnce, "same-compartment");
  var resultD = sandboxResult(codeNestedDeep, "same-compartment");

  //if (resultO != "" && resultO != "undefined" && resultO != "use strict")
  //  print("NestTest: " + resultO);

  if (resultO != resultD) {
    print("resultO: " + resultO);
    print("resultD: " + resultD);
    printAndStop("NestTest mismatch");
  }
}

function compartmentConsistencyTest(code)
{
  if ((code.indexOf("/") != -1 && code.indexOf(">") != -1) || code.indexOf("XML") != -1) {
    return; // see bug 683361 comment 2 (XML can't be wrapped; luke says this is intentional even after that bug is fixed)
  }

  // Inspired by bug 683361
  var resultS = sandboxResult(code, "same-compartment");
  var resultN = sandboxResult(code, "new-compartment");

  if (resultS != resultN) {
    print("resultO: " + resultS);
    print("resultD: " + resultN);
    printAndStop("CompartmentTest mismatch");
  }
}

// Hack to make line numbers be consistent, to make spidermonkey
// disassemble() comparison testing easier (e.g. for round-trip testing)
function directEvalC(s) { var c; /* evil closureizer */ return eval(s); } function newFun(s) { return new Function(s); }

function tryRunning(f, code)
{
  try {
    if (verbose)
    dumpln("About to run it!");
    var rv = f();
    if (verbose)
      dumpln("It ran!");
    return rv;
  } catch(runError) {
    if(verbose)
      dumpln("Running threw!  About to toString to error.");
    var err = errorToString(runError);
    dumpln("Running threw: " + err);
    tryEnsureSanity();
    // bug 465908 and other e4x uneval nonsense make this show lots of false positives
    // checkErrorMessage(err, code);
    return null;
  }
}


// Store things now so we can restore sanity later.
var realEval = eval;
var realMath = Math;
var realFunction = Function;
var realGC = gc;
var realUneval = uneval;
var realToString = toString;
var realToSource = this.toSource; // "this." because it only exists in spidermonkey


function tryEnsureSanity()
{
  try {
    // The script might have turned on gczeal.  Turn it back off right away to avoid slowness.
    if (typeof gczeal == "function")
      gczeal(0);
  } catch(e) { }

  // At least one bug in the past has put exceptions in strange places.  This also catches "eval getter" issues.
  try { eval("") } catch(e) { dumpln("That really shouldn't have thrown: " + errorToString(e)); }

  if (!this) {
    // Strict mode. Great.
    return;
  }

  try {
    // Try to get rid of any fake 'unwatch' functions.
    delete this.unwatch;

    // Restore important stuff that might have been broken as soon as possible :)
    if ('unwatch' in this) {
      this.unwatch("eval")
      this.unwatch("Function")
      this.unwatch("gc")
      this.unwatch("uneval")
      this.unwatch("toSource")
      this.unwatch("toString")
    }

    if ('__defineSetter__' in this) {
      // The only way to get rid of getters/setters is to delete the property.
      if (!jsStrictMode)
        delete this.eval;
      delete this.Math;
      delete this.Function;
      delete this.gc;
      delete this.uneval;
      delete this.toSource;
      delete this.toString;
    }

    this.Math = realMath;
    this.eval = realEval;
    this.Function = realFunction;
    this.gc = realGC;
    this.uneval = realUneval;
    this.toSource = realToSource;
    this.toString = realToString;
  } catch(e) {
    printAndStop("tryEnsureSanity failed: " + e, true);
  }

  // These can fail if the page creates a getter for "eval", for example.
  if (this.eval != realEval)
    printAndStop("Fuzz script replaced |eval|, stopping.", true);
  if (Function != realFunction)
    printAndStop("Fuzz script replaced |Function|, stopping.", true);
}

function tryIteration(rv)
{
  try {
    if (!(Iterator(rv) === rv))
      return; // not an iterator
  }
  catch(e) {
    // Is it a bug that it's possible to end up here?  Probably not!
    dumpln("Error while trying to determine whether it's an iterator!");
    dumpln("The error was: " + e);
    return;
  }

  dumpln("It's an iterator!");
  try {
    var iterCount = 0;
    var iterValue;
    // To keep Safari-compatibility, don't use "let", "each", etc.
    for /* each */ ( /* let */ iterValue in rv)
      ++iterCount;
    dumpln("Iterating succeeded, iterCount == " + iterCount);
  } catch (iterError) {
    dumpln("Iterating threw!");
    dumpln("Iterating threw: " + errorToString(iterError));
  }
}



/***********************************
 * WHOLE-FUNCTION DECOMPILER TESTS *
 ***********************************/

function tryRoundTripStuff(f, code, wtt)
{
  if (verbose)
    dumpln("About to do the 'toString' round-trip test");

  // Functions are prettier with line breaks, so test toString before uneval.
  checkRoundTripToString(f, code, wtt);

  if (wtt.checkRecompiling && wtt.checkForMismatch && wtt.checkForExtraParens) {
    try {
      testForExtraParens(f, code);
    } catch(e) { /* bug 355667 is annoying here too */ }
  }

  if (haveRealUneval) {
    if (verbose)
      dumpln("About to do the 'uneval' round-trip test");
    checkRoundTripUneval(f, code, wtt);
  }
}

// Function round-trip with implicit toString
function checkRoundTripToString(f, code, wtt)
{
  var fs, g;
  try {
    fs = "" + f;
  } catch(e) { reportRoundTripIssue("Round-trip with implicit toString: can't toString", code, null, null, errorToString(e)); return; }

  checkForCookies(fs);

  if (wtt.checkRecompiling) {
    try {
      g = eval("(" + fs + ")");
      var gs = "" + g;
      if (wtt.checkForMismatch && fs != gs) {
        reportRoundTripIssue("Round-trip with implicit toString", code, fs, gs, "mismatch");
        wtt.checkForMismatch = false;
      }
    } catch(e) {
      reportRoundTripIssue("Round-trip with implicit toString: error", code, fs, gs, errorToString(e));
    }
  }
}

// Function round-trip with uneval
function checkRoundTripUneval(f, code, wtt)
{
  var g, uf, ug;
  try {
    uf = uneval(f);
  } catch(e) { reportRoundTripIssue("Round-trip with uneval: can't uneval", code, null, null, errorToString(e)); return; }

  checkForCookies(uf);

  if (wtt.checkRecompiling) {
    try {
      g = eval("(" + uf + ")");
      ug = uneval(g);
      if (wtt.checkForMismatch && ug != uf) {
        reportRoundTripIssue("Round-trip with uneval: mismatch", code, uf, ug, "mismatch");
        wtt.checkForMismatch = false;
      }
    } catch(e) { reportRoundTripIssue("Round-trip with uneval: error", code, uf, ug, errorToString(e)); }
  }
}

function checkForCookies(code)
{
  // http://lxr.mozilla.org/seamonkey/source/js/src/jsopcode.c#1613
  // These are things that shouldn't appear in decompilations.
  if (code.indexOf("/*EXCEPTION") != -1
   || code.indexOf("/*RETSUB") != -1
   || code.indexOf("/*FORELEM") != -1
   || code.indexOf("/*WITH") != -1)
    printAndStop(code)
}

function reportRoundTripIssue(issue, code, fs, gs, e)
{
  if (e.indexOf("missing variable name") != -1) {
    dumpln("Bug 355667 sure is annoying!");
    return;
  }

  if (e.indexOf("illegal XML character") != -1) {
    dumpln("Ignoring bug 355674.");
    return;
  }

  if (fs && gs && fs.replace(/'/g, "\"") == gs.replace(/'/g, "\"")) {
    dumpln("Ignoring quote mismatch (bug 346898 (wontfix)).");
    return;
  }

  var message = issue + "\n\n" +
                "Code: " + uneval(code) + "\n\n" +
                "fs: " + fs + "\n\n" +
                "gs: " + gs + "\n\n" +
                "error: " + e;

  printAndStop(message);
}


/*************************************************
 * EXPRESSION DECOMPILATION & VALUE UNEVAL TESTS *
 *************************************************/


function testUneval(o)
{
  // If it happens to return an object, especially an array or hash,
  // let's test uneval.  Note that this is a different code path than decompiling
  // an array literal within a function, although the two code paths often have
  // similar bugs!

  var uo, euo, ueuo;

  uo = uneval(o);

  if (uo == "({})") {
    // ?
    return;
  }

  if (testUnevalString(uo)) {
    // count=946; tryItOut("return (({ set x x (x) { yield  /x/g  } , x setter: ({}).hasOwnProperty }));");
    uo = uo.replace(/\[native code\]/g, "");
    if (uo.charAt(0) == "/")
      return; // ignore bug 362582

    try {
      euo = eval(uo); // if this throws, something's wrong with uneval, probably
    } catch(e) {
      dumpln("The string returned by uneval failed to eval!");
      dumpln("The string was: " + uo);
      printAndStop(e);
      return;
    }
    ueuo = uneval(euo);
    if (ueuo != uo) {
      printAndStop("Mismatch with uneval/eval on the function's return value! " + "\n" + uo + "\n" + ueuo);
    }
  } else {
    dumpln("Skipping re-eval test");
  }
}


function testUnevalString(uo)
{
  var uowlb = uo.replace(/\n/g, " ").replace(/\r/g, " ");

  return true
      &&  uo.indexOf("[native code]") == -1                // ignore bug 384756
      && (uo.indexOf("#") == -1)                           // ignore bug 328745 (ugh)
      && (uo.indexOf("{") == -1 || uo.indexOf(":") == -1)  // ignore bug 379525 hard (ugh!)
      &&  uo.indexOf("NaN") == -1                          // see bug 379521 (wontfix)
      &&  uo.indexOf("Infinity") == -1                     // see bug 379521 (wontfix)
      &&  uo.indexOf(",]") == -1                           // avoid  bug 334628 / bug 379525?
      &&  uo.indexOf("[function") == -1                    // avoid  bug 380379?
      &&  uo.indexOf("[(function") == -1                   // avoid  bug 380379?
      && !uowlb.match(/new.*Error/)                        // ignore bug 380578
      && !uowlb.match(/<.*\/.*>.*<.*\/.*>/)                // ignore bug 334628
  ;
}


function checkErrorMessage(err, code)
{
  // Checking to make sure DVG is behaving (and not, say, playing with uninitialized memory)
  if (engine == ENGINE_SPIDERMONKEY_TRUNK) {
    checkErrorMessage2(err, "TypeError: ", " is not a function");
    checkErrorMessage2(err, "TypeError: ", " is not a constructor");
    checkErrorMessage2(err, "TypeError: ", " is undefined");
  }

  // These should probably be tested too:XML.ignoreComments
  // XML filter is applied to non-XML value ...
  // invalid 'instanceof' operand ...
  // invalid 'in' operand ...
  // missing argument 0 when calling function ...
  // ... has invalid __iterator__ value ... (two of them!!)
}

function checkErrorMessage2(err, prefix, suffix)
{
  var P = prefix.length;
  var S = suffix.length;
  if (err.substr(0, P) == prefix) {
    if (err.substr(-S, S) == suffix) {
      var dvg = err.substr(11, err.length - P - S);
      print("Testing an expression in a recent error message: " + dvg);

      // These error messages can involve decompilation of expressions (DVG),
      // but in some situations they can just be uneval of a value.  In those
      // cases, we don't want to complain about known uneval bugs.
      if (!testUnevalString(dvg)) {
        print("Ignoring error message string because it looks like a known-bogus uneval");
        return;
      }


      if (dvg == "") {
        print("Ignoring E4X uneval bogosity");
        // e.g. the error message from (<x/>.(false))()
        // bug 465908, etc.
        return;
      }

      try {
        eval("(function() { return (" + dvg + "); })");
      } catch(e) {
        printAndStop("DVG has apparently failed us: " + e);
      }
    }
  }
}




/**************************
 * PARENTHESIZATION TESTS *
 **************************/


// Returns an array of strings of length (code.length-2),
// each having one pair of matching parens removed.
// Assumes all parens in code are significant.  This assumption fails
// for strings or regexps, but whatever.
function deParen(code)
{
  // Get a list of locations of parens.
  var parenPairs = []; // array of { left : int, right : int } (indices into code string)
  var unmatched = []; // stack of indices into parenPairs

  var i, c;

  for (i = 0; i < code.length; ++i) {
    c = code.charCodeAt(i);
    if (c == 40) {
      // left paren
      unmatched.push(parenPairs.length);
      parenPairs.push({ left: i });
    } else if (c == 41) {
      // right paren
      if (unmatched.length == 0)
        return []; // eep! unmatched rparen!
      parenPairs[unmatched.pop()].right = i;
    }
  }

  if (unmatched.length > 0)
    return []; // eep! unmatched lparen!

  var rs = [];

  // Don't add spaces in place of the parens, because we don't
  // want to detect things like (5).x as being unnecessary use
  // of parens.

  for (i = 0; i < parenPairs.length; ++i) {
    var left = parenPairs[i].left, right = parenPairs[i].right;
    rs.push(
        code.substr(0, left)
      + code.substr(left + 1, right - (left + 1))
      + code.substr(right + 1)
    );
  }

  return rs;
}

// print(uneval(deParen("for (i = 0; (false); ++i) { x(); }")));
// print(uneval(deParen("[]")));

function testForExtraParens(f, code)
{
  code = code.replace(/\n/g, " ").replace(/\r/g, " "); // regexps can't match across lines

  var uf = "" + f;

  // numbers get more parens than they need
  if (uf.match(/\(\d/)) return;

  if (uf.indexOf("(<") != -1) return; // bug 381204
  if (uf.indexOf(".(") != -1) return; // bug 381207
  if (code.indexOf("new") != -1) return; // "new" is weird. what can i say?
  if (code.indexOf("let") != -1) return; // reasonable to overparenthesize "let" (see expclo#c33)
  if (code.match(/\:.*function/)) return; // why?
  if (uf.indexOf("(function") != -1) return; // expression closures over-parenthesize

  if (code.match(/for.*yield/)) return; // why?
  if (uf.indexOf("= (yield") != -1) return;
  if (uf.indexOf(":(yield") != -1) return;
  if (uf.indexOf(": (yield") != -1) return;
  if (uf.indexOf(", (yield") != -1) return;
  if (uf.indexOf("[(yield") != -1) return;
  if (uf.indexOf("yield") != -1) return; // i give up on yield

  // Sanity check
  var euf = eval("(" + uf + ")");
  var ueuf = "" + euf;
  if (ueuf != uf)
    printAndStop("Shouldn't the earlier round-trip test have caught this?");

  var dps = deParen(uf);
  // skip the first, which is the function's formal params.

  for (var i = 1; i < dps.length; ++i) {
    var uf2 = dps[i];

    try {
      var euf2 = eval("(" + uf2 + ")");
    } catch(e) { /* print("The latter did not compile.  That's fine."); */ continue; }

    var ueuf2 = "" + euf2

    if (ueuf2 == ueuf) {
      print(uf);
      print("    vs    ");
      print(uf2);
      print("Both decompile as:");
      print(ueuf);
      printAndStop("Unexpected match!!!  Extra parens!?");
    }
  }
}


/*********************************
 * SPIDERMONKEY DISASSEMBLY TEST *
 *********************************/

// Finds decompiler bugs and bytecode inefficiencies by complaining when a round trip
// through the decompiler changes the bytecode.
function checkRoundTripDisassembly(f, code, wtt)
{
  if (code.indexOf("[@") != -1 || code.indexOf("*::") != -1 || code.indexOf("::*") != -1 || code.match(/\[.*\*/)) {
    dumpln("checkRoundTripDisassembly: ignoring bug 475859");
    return;
  }

  var uf = uneval(f);

  if (uf.indexOf("switch") != -1) {
    dumpln("checkRoundTripDisassembly: ignoring bug 355509");
    return;
  }

  if (code.indexOf("new") != code.lastIndexOf("new")) {
    dumpln("checkRoundTripDisassembly: ignoring function with two 'new' operators (bug 475848)");
    return;
  }

  if (code.match(/for.*\(.*in.*\).*if/)) {
    print("checkRoundTripDisassembly: ignoring array comprehension with 'if' (bug 475882)");
    return;
  }

  var df = disassemble(f);

  if (df.indexOf("newline") != -1)
    return;
  if (df.indexOf("lineno") != -1)
    return;

  try {
    var g = directEvalC(uf);
  } catch(e) {
    print("checkRoundTripDisassembly: ignoring stuff that should be caught by the uneval test");
    return;
  }

  var dg = disassemble(g);

  if (df == dg) {
    // Happy!
    return;
  }

  if (dg.indexOf("newline") != -1) {
    // Really should just ignore these lines, instead of bailing...
    return;
  }

  var dfl = df.split("\n");
  var dgl = dg.split("\n");
  for (var i = 0; i < dfl.length && i < dgl.length; ++i) {
    if (dfl[i] != dgl[i]) {
      if (dfl[i] == "00000:  generator") {
        print("checkRoundTripDisassembly: ignoring loss of generator (bug 350743)");
        return;
      }
      if (dfl[i].indexOf("goto") != -1 && dgl[i].indexOf("stop") != -1 && uf.indexOf("switch") != -1) {
        // Actually, this might just be bug 355509.
        print("checkRoundTripDisassembly: ignoring extra 'goto' in switch (bug 475838)");
        return;
      }
      if (dfl[i].indexOf("regexp null") != -1) {
        print("checkRoundTripDisassembly: ignoring 475844 / regexp");
        return;
      }
      if (dfl[i].indexOf("namedfunobj null") != -1 || dfl[i].indexOf("anonfunobj null") != -1) {
        print("checkRoundTripDisassembly: ignoring 475844 / function");
        return;
      }
      if (dfl[i].indexOf("string") != -1 && (dfl[i+1].indexOf("toxml") != -1 || dfl[i+1].indexOf("startxml") != -1)) {
        print("checkRoundTripDisassembly: ignoring e4x-string mismatch (likely bug 355674)");
        return;
      }
      if (dfl[i].indexOf("string") != -1 && df.indexOf("startxmlexpr") != -1) {
        print("checkRoundTripDisassembly: ignoring complicated e4x-string mismatch (likely bug 355674)");
        return;
      }
      if (dfl[i].indexOf("newinit") != -1 && dgl[i].indexOf("newarray 0") != -1) {
        print("checkRoundTripDisassembly: ignoring array comprehension disappearance (bug 475847)");
        return;
      }
      if (i == 0 && dfl[i].indexOf("HEAVYWEIGHT") != -1 && dgl[i].indexOf("HEAVYWEIGHT") == -1) {
        print("checkRoundTripDisassembly: ignoring unnecessarily HEAVYWEIGHT function (bug 475854)");
        return;
      }
      if (i == 0 && dfl[i].indexOf("HEAVYWEIGHT") == -1 && dgl[i].indexOf("HEAVYWEIGHT") != -1) {
        // The other direction
        // var __proto__ hoisting, for example
        print("checkRoundTripDisassembly: ignoring unnecessarily HEAVYWEIGHT function (bug 475854 comment 1)");
        return;
      }
      if (dfl[i].indexOf("pcdelta") != -1 && dgl[i].indexOf("pcdelta") != -1) {
        print("checkRoundTripDisassembly: pcdelta changed, who cares? (bug 475908)");
        return;
      }

      print("First line that does not match:");
      print(dfl[i]);
      print(dgl[i]);
      print("");
      break;
    }
  }
  print("Original code:");
  print(code);
  print("");
  print("Original function:");
  print(uf);
  print(df);
  print("");
  print("Function from recompiling:");
  print(uf);
  print(dg);
  print("");
  printAndStop("Disassembly was not stable through decompilation");
}



/***********
 * SANDBOX *
 ***********/


function sandboxResult(code, globalType)
{
  // Use sandbox to isolate side-effects.
  var result;
  var resultStr = "";
  try {
    // Using newGlobal("new-compartment"), rather than evalcx(''), to get
    // shell functions. (see bug 647412 comment 2)
    var sandbox = newGlobal(globalType);

    result = evalcx(code, sandbox);
    if (typeof result != "object") {
      // Avoid cross-compartment excitement if it has a toString
      resultStr = "" + result;
    }
  } catch(e) {
    result = "Error: " + errorToString(e);
  }
  //print("resultStr: " + resultStr);
  return resultStr;
}


/*********************
 * SPECIALIZED TESTS *
 *********************/

function simpleDVGTest(code)
{
  var fullCode = "(function() { try { \n" + code + "\n; throw 1; } catch(exx) { this.nnn.nnn } })()";

  try {
    eval(fullCode);
  } catch(e) {
    if (e.message != "this.nnn is undefined" && e.message.indexOf("redeclaration of") == -1) {
      printAndStop("Wrong error message: " + e);
    }
  }
}


function optionalTests(f, code, wtt)
{
  if (0) {
    tryHalves(code);
  }

  if (0 && engine == ENGINE_SPIDERMONKEY_TRUNK) {
    if (wtt.allowExec && (typeof sandbox == "function")) {
      f = null;
      if (trySandboxEval(code, false)) {
        dumpln("Trying it again to see if it's a 'real leak' (???)")
        trySandboxEval(code, true);
      }
    }
    return;
  }

  if (0 && f && typeof disassemble == "function") {
    // It's hard to use the recursive disassembly in the comparator,
    // but let's at least make sure the disassembler itself doesn't crash.
    // (Disabled: relatively unimportant, a little slow)
    disassemble("-r", f);
  }

  if (0 && f && wtt.allowExec && engine == ENGINE_SPIDERMONKEY_TRUNK) {
    simpleDVGTest(code);
    tryEnsureSanity();
  }
}



function trySandboxEval(code, isRetry)
{
  // (function(){})() wrapping allows "return" when it's allowed outside.
  // The line breaks are to allow single-line comments within code ("//" and "<!--").

  if (!sandbox) {
    sandbox = evalcx("");
  }

  var rv = null;
  try {
    rv = evalcx("(function(){\n" + code + "\n})();", sandbox);
  } catch(e) {
    rv = "Error from sandbox: " + errorToString(e);
  }

  try {
    if (typeof rv != "undefined")
      dumpln(rv);
  } catch(e) {
    dumpln("Sandbox error printing: " + errorToString(e));
  }
  rv = null;

  if (1 || count % 100 == 0) { // count % 100 *here* is sketchy.
    dumpln("Done with this sandbox.");
    sandbox = null;
    gc();
    var currentHeapCount = countHeap()
    dumpln("countHeap: " + currentHeapCount);
    if (currentHeapCount > maxHeapCount) {
      if (maxHeapCount != 0)
        dumpln("A new record by " + (currentHeapCount - maxHeapCount) + "!");
      if (isRetry)
        throw new Error("Found a leak!");
      maxHeapCount = currentHeapCount;
      return true;
    }
  }

  return false;
}


function tryHalves(code)
{
  // See if there are any especially horrible bugs that appear when the parser has to start/stop in the middle of something. this is kinda evil.

  // Stray "}"s are likely in secondHalf, so use new Function rather than eval.  "}" can't escape from new Function :)

  var f, firstHalf, secondHalf;

  try {

    firstHalf = code.substr(0, code.length / 2);
    if (verbose)
      dumpln("First half: " + firstHalf);
    f = new Function(firstHalf);
    "" + f;
  }
  catch(e) {
    if (verbose)
      dumpln("First half compilation error: " + e);
  }

  try {
    secondHalf = code.substr(code.length / 2, code.length);
    if (verbose)
      dumpln("Second half: " + secondHalf);
    f = new Function(secondHalf);
    "" + f;
  }
  catch(e) {
    if (verbose)
      dumpln("Second half compilation error: " + e);
  }
}





/***************************
 * REPRODUCIBLE RANDOMNESS *
 ***************************/


// this program is a JavaScript version of Mersenne Twister, with concealment and encapsulation in class,
// an almost straight conversion from the original program, mt19937ar.c,
// translated by y. okada on July 17, 2006.
// Changes by Jesse Ruderman: added "var" keyword in a few spots; added export_mta etc; pasted into fuzz.js.
// in this program, procedure descriptions and comments of original source code were not removed.
// lines commented with //c// were originally descriptions of c procedure. and a few following lines are appropriate JavaScript descriptions.
// lines commented with /* and */ are original comments.
// lines commented with // are additional comments in this JavaScript version.
// before using this version, create at least one instance of MersenneTwister19937 class, and initialize the each state, given below in c comments, of all the instances.
/*
   A C-program for MT19937, with initialization improved 2002/1/26.
   Coded by Takuji Nishimura and Makoto Matsumoto.

   Before using, initialize the state by using init_genrand(seed)
   or init_by_array(init_key, key_length).

   Copyright (C) 1997 - 2002, Makoto Matsumoto and Takuji Nishimura,
   All rights reserved.

   Redistribution and use in source and binary forms, with or without
   modification, are permitted provided that the following conditions
   are met:

     1. Redistributions of source code must retain the above copyright
        notice, this list of conditions and the following disclaimer.

     2. Redistributions in binary form must reproduce the above copyright
        notice, this list of conditions and the following disclaimer in the
        documentation and/or other materials provided with the distribution.

     3. The names of its contributors may not be used to endorse or promote
        products derived from this software without specific prior written
        permission.

   THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
   "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
   LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
   A PARTICULAR PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL THE COPYRIGHT OWNER OR
   CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
   EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
   PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
   PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
   LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
   NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
   SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.


   Any feedback is very welcome.
   http://www.math.sci.hiroshima-u.ac.jp/~m-mat/MT/emt.html
   email: m-mat @ math.sci.hiroshima-u.ac.jp (remove space)
*/

function MersenneTwister19937()
{
	/* Period parameters */
	//c//#define N 624
	//c//#define M 397
	//c//#define MATRIX_A 0x9908b0dfUL   /* constant vector a */
	//c//#define UPPER_MASK 0x80000000UL /* most significant w-r bits */
	//c//#define LOWER_MASK 0x7fffffffUL /* least significant r bits */
	var N = 624;
	var M = 397;
	var MATRIX_A = 0x9908b0df;   /* constant vector a */
	var UPPER_MASK = 0x80000000; /* most significant w-r bits */
	var LOWER_MASK = 0x7fffffff; /* least significant r bits */
	//c//static unsigned long mt[N]; /* the array for the state vector  */
	//c//static int mti=N+1; /* mti==N+1 means mt[N] is not initialized */
	var mt = new Array(N);   /* the array for the state vector  */
	var mti = N+1;           /* mti==N+1 means mt[N] is not initialized */

	function unsigned32 (n1) // returns a 32-bits unsiged integer from an operand to which applied a bit operator.
	{
		return n1 < 0 ? (n1 ^ UPPER_MASK) + UPPER_MASK : n1;
	}

	function subtraction32 (n1, n2) // emulates lowerflow of a c 32-bits unsiged integer variable, instead of the operator -. these both arguments must be non-negative integers expressible using unsigned 32 bits.
	{
		return n1 < n2 ? unsigned32((0x100000000 - (n2 - n1)) & 0xffffffff) : n1 - n2;
	}

	function addition32 (n1, n2) // emulates overflow of a c 32-bits unsiged integer variable, instead of the operator +. these both arguments must be non-negative integers expressible using unsigned 32 bits.
	{
		return unsigned32((n1 + n2) & 0xffffffff)
	}

	function multiplication32 (n1, n2) // emulates overflow of a c 32-bits unsiged integer variable, instead of the operator *. these both arguments must be non-negative integers expressible using unsigned 32 bits.
	{
		var sum = 0;
		for (var i = 0; i < 32; ++i){
			if ((n1 >>> i) & 0x1){
				sum = addition32(sum, unsigned32(n2 << i));
			}
		}
		return sum;
	}

	/* initializes mt[N] with a seed */
	//c//void init_genrand(unsigned long s)
	this.init_genrand = function (s)
	{
		//c//mt[0]= s & 0xffffffff;
		mt[0]= unsigned32(s & 0xffffffff);
		for (mti=1; mti<N; mti++) {
			mt[mti] =
			//c//(1812433253 * (mt[mti-1] ^ (mt[mti-1] >> 30)) + mti);
			addition32(multiplication32(1812433253, unsigned32(mt[mti-1] ^ (mt[mti-1] >>> 30))), mti);
			/* See Knuth TAOCP Vol2. 3rd Ed. P.106 for multiplier. */
			/* In the previous versions, MSBs of the seed affect   */
			/* only MSBs of the array mt[].                        */
			/* 2002/01/09 modified by Makoto Matsumoto             */
			//c//mt[mti] &= 0xffffffff;
			mt[mti] = unsigned32(mt[mti] & 0xffffffff);
			/* for >32 bit machines */
		}
	}

	/* initialize by an array with array-length */
	/* init_key is the array for initializing keys */
	/* key_length is its length */
	/* slight change for C++, 2004/2/26 */
	//c//void init_by_array(unsigned long init_key[], int key_length)
	this.init_by_array = function (init_key, key_length)
	{
		//c//int i, j, k;
		var i, j, k;
		//c//init_genrand(19650218);
		this.init_genrand(19650218);
		i=1; j=0;
		k = (N>key_length ? N : key_length);
		for (; k; k--) {
			//c//mt[i] = (mt[i] ^ ((mt[i-1] ^ (mt[i-1] >> 30)) * 1664525))
			//c//	+ init_key[j] + j; /* non linear */
			mt[i] = addition32(addition32(unsigned32(mt[i] ^ multiplication32(unsigned32(mt[i-1] ^ (mt[i-1] >>> 30)), 1664525)), init_key[j]), j);
			mt[i] =
			//c//mt[i] &= 0xffffffff; /* for WORDSIZE > 32 machines */
			unsigned32(mt[i] & 0xffffffff);
			i++; j++;
			if (i>=N) { mt[0] = mt[N-1]; i=1; }
			if (j>=key_length) j=0;
		}
		for (k=N-1; k; k--) {
			//c//mt[i] = (mt[i] ^ ((mt[i-1] ^ (mt[i-1] >> 30)) * 1566083941))
			//c//- i; /* non linear */
			mt[i] = subtraction32(unsigned32((dbg=mt[i]) ^ multiplication32(unsigned32(mt[i-1] ^ (mt[i-1] >>> 30)), 1566083941)), i);
			//c//mt[i] &= 0xffffffff; /* for WORDSIZE > 32 machines */
			mt[i] = unsigned32(mt[i] & 0xffffffff);
			i++;
			if (i>=N) { mt[0] = mt[N-1]; i=1; }
		}
		mt[0] = 0x80000000; /* MSB is 1; assuring non-zero initial array */
	}

  this.export_state = function() { return [mt, mti]; };
  this.import_state = function(s) { mt = s[0]; mti = s[1]; };
  this.export_mta = function() { return mt; };
  this.import_mta = function(_mta) { mt = _mta };
  this.export_mti = function() { return mti; };
  this.import_mti = function(_mti) { mti = _mti; }

	/* generates a random number on [0,0xffffffff]-interval */
	//c//unsigned long genrand_int32(void)
	this.genrand_int32 = function ()
	{
		//c//unsigned long y;
		//c//static unsigned long mag01[2]={0x0UL, MATRIX_A};
		var y;
		var mag01 = new Array(0x0, MATRIX_A);
		/* mag01[x] = x * MATRIX_A  for x=0,1 */

		if (mti >= N) { /* generate N words at one time */
			//c//int kk;
			var kk;

			if (mti == N+1)   /* if init_genrand() has not been called, */
				//c//init_genrand(5489); /* a default initial seed is used */
				this.init_genrand(5489); /* a default initial seed is used */

			for (kk=0;kk<N-M;kk++) {
				//c//y = (mt[kk]&UPPER_MASK)|(mt[kk+1]&LOWER_MASK);
				//c//mt[kk] = mt[kk+M] ^ (y >> 1) ^ mag01[y & 0x1];
				y = unsigned32((mt[kk]&UPPER_MASK)|(mt[kk+1]&LOWER_MASK));
				mt[kk] = unsigned32(mt[kk+M] ^ (y >>> 1) ^ mag01[y & 0x1]);
			}
			for (;kk<N-1;kk++) {
				//c//y = (mt[kk]&UPPER_MASK)|(mt[kk+1]&LOWER_MASK);
				//c//mt[kk] = mt[kk+(M-N)] ^ (y >> 1) ^ mag01[y & 0x1];
				y = unsigned32((mt[kk]&UPPER_MASK)|(mt[kk+1]&LOWER_MASK));
				mt[kk] = unsigned32(mt[kk+(M-N)] ^ (y >>> 1) ^ mag01[y & 0x1]);
			}
			//c//y = (mt[N-1]&UPPER_MASK)|(mt[0]&LOWER_MASK);
			//c//mt[N-1] = mt[M-1] ^ (y >> 1) ^ mag01[y & 0x1];
			y = unsigned32((mt[N-1]&UPPER_MASK)|(mt[0]&LOWER_MASK));
			mt[N-1] = unsigned32(mt[M-1] ^ (y >>> 1) ^ mag01[y & 0x1]);
			mti = 0;
		}

		y = mt[mti++];

		/* Tempering */
		//c//y ^= (y >> 11);
		//c//y ^= (y << 7) & 0x9d2c5680;
		//c//y ^= (y << 15) & 0xefc60000;
		//c//y ^= (y >> 18);
		y = unsigned32(y ^ (y >>> 11));
		y = unsigned32(y ^ ((y << 7) & 0x9d2c5680));
		y = unsigned32(y ^ ((y << 15) & 0xefc60000));
		y = unsigned32(y ^ (y >>> 18));

		return y;
	}

	/* generates a random number on [0,0x7fffffff]-interval */
	//c//long genrand_int31(void)
	this.genrand_int31 = function ()
	{
		//c//return (genrand_int32()>>1);
		return (this.genrand_int32()>>>1);
	}

	/* generates a random number on [0,1]-real-interval */
	//c//double genrand_real1(void)
	this.genrand_real1 = function ()
	{
		//c//return genrand_int32()*(1.0/4294967295.0);
		return this.genrand_int32()*(1.0/4294967295.0);
		/* divided by 2^32-1 */
	}

	/* generates a random number on [0,1)-real-interval */
	//c//double genrand_real2(void)
	this.genrand_real2 = function ()
	{
		//c//return genrand_int32()*(1.0/4294967296.0);
		return this.genrand_int32()*(1.0/4294967296.0);
		/* divided by 2^32 */
	}

	/* generates a random number on (0,1)-real-interval */
	//c//double genrand_real3(void)
	this.genrand_real3 = function ()
	{
		//c//return ((genrand_int32()) + 0.5)*(1.0/4294967296.0);
		return ((this.genrand_int32()) + 0.5)*(1.0/4294967296.0);
		/* divided by 2^32 */
	}

	/* generates a random number on [0,1) with 53-bit resolution*/
	//c//double genrand_res53(void)
	this.genrand_res53 = function ()
	{
		//c//unsigned long a=genrand_int32()>>5, b=genrand_int32()>>6;
		var a=this.genrand_int32()>>>5, b=this.genrand_int32()>>>6;
		return(a*67108864.0+b)*(1.0/9007199254740992.0);
	}
	/* These real versions are due to Isaku Wada, 2002/01/09 added */
}


var rnd;

if (1) {

  // Mersenne twister: I get to set the seed, great distribution of random numbers, but pretty slow
  // (spidermonkey trunk 2008-10-08 with JIT on, makes jsfunfuzz 20% slower overall!)

  (function() {
    var fuzzMT = new MersenneTwister19937;
    var fuzzSeed = Math.floor(Math.random() * Math.pow(2,28));
    dumpln("fuzzSeed: " + fuzzSeed);
    fuzzMT.init_genrand(fuzzSeed);
    rnd = function (n) { return Math.floor(fuzzMT.genrand_real2() * n); };
    rnd.rndReal = function() { return fuzzMT.genrand_real2(); };
    rnd.fuzzMT = fuzzMT;
  })();
} else {

  // Math.random(): ok distribution of random numbers, fast

  rnd = function (n) { return Math.floor(Math.random() * n); };
}


function errorstack()
{
  print("EEE");
  try { [].qwerty.qwerty } catch(e) { print(e.stack) }
}

function rndElt(a)
{
  if (typeof a == "string") {
    dumpln("String passed to rndElt: " + a);
    errorstack();
  }

  if (typeof a == "function")
    dumpln("Function passed to rndElt: " + a);

  if (a == null)
    dumpln("Null passed to rndElt");

  if (!a.length) {
    dumpln("Empty thing passed to rndElt");
    return null;
  }

  return a[rnd(a.length)];
}



/**************************
 * TOKEN-LEVEL GENERATION *
 **************************/


// Each input to |cat| should be a token or so, OR a bigger logical piece (such as a call to makeExpr).  Smaller than a token is ok too ;)

// When "torture" is true, it may do any of the following:
// * skip a token
// * skip all the tokens to the left
// * skip all the tokens to the right
// * insert unterminated comments
// * insert line breaks
// * insert entire expressions
// * insert any token

// Even when not in "torture" mode, it may sneak in extra line breaks.

// Why did I decide to toString at every step, instead of making larger and larger arrays (or more and more deeply nested arrays?).  no particular reason...

function cat(toks)
{
  if (rnd(1700) == 0)
    return totallyRandom(2, []);

  var torture = (rnd(1700) == 57);
  if (torture)
    dumpln("Torture!!!");

  var s = maybeLineBreak();
  for (var i = 0; i < toks.length; ++i) {

    // Catch bugs in the fuzzer.  An easy mistake is
    //   return /*foo*/ + ...
    // instead of
    //   return "/*foo*/" + ...
    // Unary plus in the first one coerces the string that follows to number!
    if(typeof(toks[i]) != "string") {
      dumpln("Strange item in the array passed to cat: toks[" + i + "] == " + toks[i]);
      dumpln(cat.caller)
      dumpln(cat.caller.caller)
      printAndStop('yarr')
    }

    if (!(torture && rnd(12) == 0))
      s += toks[i];

    s += maybeLineBreak();

    if (torture) switch(rnd(120)) {
      case 0:
      case 1:
      case 2:
      case 3:
      case 4:
        s += maybeSpace() + totallyRandom(2, []) + maybeSpace();
        break;
      case 5:
        s = "(" + s + ")"; // randomly parenthesize some *prefix* of it.
        break;
      case 6:
        s = ""; // throw away everything before this point
        break;
      case 7:
        return s; // throw away everything after this point
      case 8:
        s += UNTERMINATED_COMMENT;
        break;
      case 9:
        s += UNTERMINATED_STRING_LITERAL;
        break;
      case 10:
        if (rnd(2))
          s += "(";
        s += UNTERMINATED_REGEXP_LITERAL;
        break;
      default:
    }

  }

  return s;
}

// For reference and debugging.
/*
function catNice(toks)
{
  var s = ""
  var i;
  for (i=0; i<toks.length; ++i) {
    if(typeof(toks[i]) != "string")
      printAndStop("Strange toks[i]: " + toks[i]);

    s += toks[i];
  }

  return s;
}
*/


var UNTERMINATED_COMMENT = "/*"; /* this comment is here so my text editor won't get confused */
var UNTERMINATED_STRING_LITERAL = "'";
var UNTERMINATED_REGEXP_LITERAL = "/";

function maybeLineBreak()
{
  if (rnd(900) == 3)
    return rndElt(["\r", "\n", "//h\n", "/*\n*/"]); // line break to trigger semicolon insertion and stuff
  else if (rnd(400) == 3)
    return rnd(2) ? "\u000C" : "\t"; // weird space-like characters
  else
    return "";
}

function maybeSpace()
{
  if (rnd(2) == 0)
    return " ";
  else
    return "";
}

function stripSemicolon(c)
{
  var len = c.length;
  if (c.charAt(len - 1) == ";")
    return c.substr(0, len - 1);
  else
    return c;
}




/*************************
 * HIGH-LEVEL GENERATION *
 *************************/


var TOTALLY_RANDOM = 500;

function makeStatement(d, b)
{
  if (rnd(TOTALLY_RANDOM) == 2) return totallyRandom(d, b);

  if (d < 6 && rnd(3) == 0)
    return makePrintStatement(d, b);

  if (d < rnd(8)) // frequently for small depth, infrequently for large depth
    return makeLittleStatement(d, b);

  d = rnd(d); // !

  return (rndElt(statementMakers))(d, b)
}

var varBinder = ["var ", "let ", "const ", ""];
var varBinderFor = ["var ", "let ", ""]; // const is a syntax error in for loops

// The reason there are several types of loops here is to create different
// types of scripts without introducing infinite loops.

function forLoopHead(d, b, v, reps)
{
  var sInit = rndElt(varBinderFor) + v + " = 0";
  var sCond = v + " < " + reps;
  var sNext = "++" + v;

  while (rnd(10) == 0)
    sInit += ", " + makeLetHeadItem(d - 2, b);
  while (rnd(10) == 0)
    sInit += ", " + makeExpr(d - 2, b); // NB: only makes sense if our varBinder is ""

  while (rnd(20) == 0)
    sCond = sCond + " && (" + makeExpr(d - 2, b) + ")";
  while (rnd(20) == 0)
    sCond = "(" + makeExpr(d - 2, b) + ") && " + sCond;

  while (rnd(20) == 0)
    sNext = sNext + ", " + makeExpr(d - 2, b);
  while (rnd(20) == 0)
    sNext = makeExpr(d - 2, b) + ", " + sNext;

  return "for (" + sInit + "; " + sCond + "; " + sNext + ")";
}

function makeOpaqueIdiomaticLoop(d, b)
{
  var reps = rnd(rnd(HOTLOOP * 3));
  var vHidden = uniqueVarName();
  return "/*oLoop*/" + forLoopHead(d, b, vHidden, reps) + " { " +
      makeStatement(d - 2, b) +
      " } "
}

function makeTransparentIdiomaticLoop(d, b)
{
  var reps = rnd(rnd(HOTLOOP * 3));
  var vHidden = uniqueVarName();
  var vVisible = makeNewId(d, b);
  return "/*vLoop*/" + forLoopHead(d, b, vHidden, reps) +
    " { " +
      rndElt(varBinder) + vVisible + " = " + vHidden + "; " +
      makeStatement(d - 2, b.concat([vVisible])) +
    " } "
}

function makeBranchUnstableLoop(d, b)
{
  var reps = rnd(rnd(HOTLOOP + 10));
  var v = uniqueVarName();
  var mod = rnd(10) + 2;
  var target = rnd(mod);
  return "/*bLoop*/" + forLoopHead(d, b, v, reps) + " { " +
    "if (" + v + " % " + mod + " == " + target + ") { " + makeStatement(d - 2, b) + " } " +
    "else { " + makeStatement(d - 2, b) + " } " +
    " } "
}

function makeTypeUnstableLoop(d, b) {
  var a = makeMixedTypeArray(d, b);
  var v = makeNewId(d, b);
  var bv = b.concat([v]);
  return "/*tLoop*/for each (let " + v + " in " + a + ") { " + makeStatement(d - 2, bv) + " }";
}

function weighted(wa)
{
  var a = [];
  for (var i = 0; i < wa.length; ++i) {
    for (var j = 0; j < wa[i].w; ++j) {
      a.push(wa[i].fun);
    }
  }
  return a;
}

var statementMakers = weighted([

  // Any two statements in sequence
  { w: 15, fun: function(d, b) { return cat([makeStatement(d - 1, b),       makeStatement(d - 1, b)      ]); } },
  { w: 15, fun: function(d, b) { return cat([makeStatement(d - 1, b), "\n", makeStatement(d - 1, b), "\n"]); } },

  // Stripping semilcolons.  What happens if semicolons are missing?  Especially with line breaks used in place of semicolons (semicolon insertion).
  { w: 1, fun: function(d, b) { return cat([stripSemicolon(makeStatement(d, b)), "\n", makeStatement(d, b)]); } },
  { w: 1, fun: function(d, b) { return cat([stripSemicolon(makeStatement(d, b)), "\n"                   ]); } },
  { w: 1, fun: function(d, b) { return stripSemicolon(makeStatement(d, b)); } }, // usually invalid, but can be ok e.g. at the end of a block with curly braces

  // Simple variable declarations, followed (or preceded) by statements using those variables
  { w: 4, fun: function(d, b) { var v = makeNewId(d, b); return cat([rndElt(varBinder), v, " = ", makeExpr(d, b), ";", makeStatement(d - 1, b.concat([v]))]); } },
  { w: 4, fun: function(d, b) { var v = makeNewId(d, b); return cat([makeStatement(d - 1, b.concat([v])), rndElt(varBinder), v, " = ", makeExpr(d, b), ";"]); } },

  // Complex variable declarations, e.g. "const [a,b] = [3,4];" or "var a,b,c,d=4,e;"
  { w: 10, fun: function(d, b) { return cat([rndElt(varBinder), makeLetHead(d, b), ";", makeStatement(d - 1, b)]); } },

  // Blocks
  { w: 2, fun: function(d, b) { return cat(["{", makeStatement(d, b), " }"]); } },
  { w: 2, fun: function(d, b) { return cat(["{", makeStatement(d - 1, b), makeStatement(d - 1, b), " }"]); } },

  // "with" blocks
  { w: 2, fun: function(d, b) {                          return cat([maybeLabel(), "with", "(", makeExpr(d, b), ")",                    makeStatementOrBlock(d, b)]);             } },
  { w: 2, fun: function(d, b) { var v = makeNewId(d, b); return cat([maybeLabel(), "with", "(", "{", v, ": ", makeExpr(d, b), "}", ")", makeStatementOrBlock(d, b.concat([v]))]); } },

  // C-style "for" loops
  // Two kinds of "for" loops: one with an expression as the first part, one with a var or let binding 'statement' as the first part.
  // I'm not sure if arbitrary statements are allowed there; I think not.
  { w: 1, fun: function(d, b) {                          return "/*infloop*/" + cat([maybeLabel(), "for", "(", makeExpr(d, b), "; ", makeExpr(d, b), "; ", makeExpr(d, b), ") ", makeStatementOrBlock(d, b)]); } },
  { w: 1, fun: function(d, b) { var v = makeNewId(d, b); return "/*infloop*/" + cat([maybeLabel(), "for", "(", rndElt(varBinderFor), v,                                                    "; ", makeExpr(d, b), "; ", makeExpr(d, b), ") ", makeStatementOrBlock(d, b.concat([v]))]); } },
  { w: 1, fun: function(d, b) { var v = makeNewId(d, b); return "/*infloop*/" + cat([maybeLabel(), "for", "(", rndElt(varBinderFor), v, " = ", makeExpr(d, b),                             "; ", makeExpr(d, b), "; ", makeExpr(d, b), ") ", makeStatementOrBlock(d, b.concat([v]))]); } },
  { w: 1, fun: function(d, b) {                          return "/*infloop*/" + cat([maybeLabel(), "for", "(", rndElt(varBinderFor), makeDestructuringLValue(d, b), " = ", makeExpr(d, b), "; ", makeExpr(d, b), "; ", makeExpr(d, b), ") ", makeStatementOrBlock(d, b)]); } },

  // Various types of "for" loops, specially set up to test tracing, carefully avoiding infinite loops
  { w: 6, fun: makeTransparentIdiomaticLoop },
  { w: 6, fun: makeOpaqueIdiomaticLoop },
  { w: 6, fun: makeBranchUnstableLoop },
  { w: 8, fun: makeTypeUnstableLoop },

  // "for..in" loops
  // arbitrary-LHS marked as infloop because
  // -- for (key in obj)
  { w: 1, fun: function(d, b) {                          return "/*infloop*/" + cat([maybeLabel(), "for", "(", rndElt(varBinderFor), makeForInLHS(d, b), " in ", makeExpr(d - 2, b), ") ", makeStatementOrBlock(d, b)]); } },
  { w: 1, fun: function(d, b) { var v = makeNewId(d, b); return                 cat([maybeLabel(), "for", "(", rndElt(varBinderFor), v,                  " in ", makeExpr(d - 2, b), ") ", makeStatementOrBlock(d, b.concat([v]))]); } },
  // -- for (key in generator())
  { w: 1, fun: function(d, b) {                          return "/*infloop*/" + cat([maybeLabel(), "for", "(", rndElt(varBinderFor), makeForInLHS(d, b), " in ", "(", "(", makeFunction(d, b), ")", "(", makeExpr(d, b), ")", ")", ")", makeStatementOrBlock(d, b)]); } },
  { w: 1, fun: function(d, b) { var v = makeNewId(d, b); return                 cat([maybeLabel(), "for", "(", rndElt(varBinderFor), v,                  " in ", "(", "(", makeFunction(d, b), ")", "(", makeExpr(d, b), ")", ")", ")", makeStatementOrBlock(d, b.concat([v]))]); } },
  // -- for each (value in obj)
  { w: 1, fun: function(d, b) {                          return "/*infloop*/" + cat([maybeLabel(), " for ", " each", "(", rndElt(varBinderFor), makeLValue(d, b), " in ", makeExpr(d - 2, b), ") ", makeStatementOrBlock(d, b)]); } },
  { w: 1, fun: function(d, b) { var v = makeNewId(d, b); return                 cat([maybeLabel(), " for ", " each", "(", rndElt(varBinderFor), v,                " in ", makeExpr(d - 2, b), ") ", makeStatementOrBlock(d, b.concat([v]))]); } },

  // Modify something during a loop -- perhaps the thing being looped over
  // Since we use "let" to bind the for-variables, and only do wacky stuff once, I *think* this is unlikely to hang.
//  function(d, b) { return "let forCount = 0; for (let " + makeId(d, b) + " in " + makeExpr(d, b) + ") { if (forCount++ == " + rnd(3) + ") { " + makeStatement(d - 1, b) + " } }"; },

  // Hoisty "for..in" loops.  I don't know why this construct exists, but it does, and it hoists the initial-value expression above the loop.
  // With "var" or "const", the entire thing is hoisted.
  // With "let", only the value is hoisted, and it can be elim'ed as a useless statement.
  // The first form could be an infinite loop because of "for (x.y in x)" with e4x.
  // The last form is specific to JavaScript 1.7 (only).
  { w: 1, fun: function(d, b) {                       return "/*infloop*/" +         cat([maybeLabel(), "for", "(", rndElt(varBinderFor), makeId(d, b),         " = ", makeExpr(d, b), " in ", makeExpr(d - 2, b), ") ", makeStatementOrBlock(d, b)]); } },
  { w: 1, fun: function(d, b) { var v = makeNewId(d, b);                      return cat([maybeLabel(), "for", "(", rndElt(varBinderFor), v,                    " = ", makeExpr(d, b), " in ", makeExpr(d - 2, b), ") ", makeStatementOrBlock(d, b.concat([v]))]); } },
  { w: 1, fun: function(d, b) { var v = makeNewId(d, b), w = makeNewId(d, b); return cat([maybeLabel(), "for", "(", rndElt(varBinderFor), "[", v, ", ", w, "]", " = ", makeExpr(d, b), " in ", makeExpr(d - 2, b), ") ", makeStatementOrBlock(d, b.concat([v, w]))]); } },

  // do..while
  { w: 1, fun: function(d, b) { return cat([maybeLabel(), "while((", makeExpr(d, b), ") && 0)" /*don't split this, it's needed to avoid marking as infloop*/, makeStatementOrBlock(d, b)]); } },
  { w: 1, fun: function(d, b) { return "/*infloop*/" + cat([maybeLabel(), "while", "(", makeExpr(d, b), ")", makeStatementOrBlock(d, b)]); } },
  { w: 1, fun: function(d, b) { return cat([maybeLabel(), "do ", makeStatementOrBlock(d, b), " while((", makeExpr(d, b), ") && 0)" /*don't split this, it's needed to avoid marking as infloop*/, ";"]); } },
  { w: 1, fun: function(d, b) { return "/*infloop*/" + cat([maybeLabel(), "do ", makeStatementOrBlock(d, b), " while", "(", makeExpr(d, b), ");"]); } },

  // Switch statement
  { w: 3, fun: function(d, b) { return cat([maybeLabel(), "switch", "(", makeExpr(d, b), ")", " { ", makeSwitchBody(d, b), " }"]); } },

  // "let" blocks, with bound variable used inside the block
  { w: 2, fun: function(d, b) { var v = makeNewId(d, b); return cat(["let ", "(", v, ")", " { ", makeStatement(d, b.concat([v])), " }"]); } },

  // "let" blocks, with and without multiple bindings, with and without initial values
  { w: 2, fun: function(d, b) { return cat(["let ", "(", makeLetHead(d, b), ")", " { ", makeStatement(d, b), " }"]); } },

  // Conditionals, perhaps with 'else if' / 'else'
  { w: 1, fun: function(d, b) { return cat([maybeLabel(), "if(", makeExpr(d, b), ") ", makeStatementOrBlock(d, b)]); } },
  { w: 1, fun: function(d, b) { return cat([maybeLabel(), "if(", makeExpr(d, b), ") ", makeStatementOrBlock(d - 1, b), " else ", makeStatementOrBlock(d - 1, b)]); } },
  { w: 1, fun: function(d, b) { return cat([maybeLabel(), "if(", makeExpr(d, b), ") ", makeStatementOrBlock(d - 1, b), " else ", " if ", "(", makeExpr(d, b), ") ", makeStatementOrBlock(d - 1, b)]); } },
  { w: 1, fun: function(d, b) { return cat([maybeLabel(), "if(", makeExpr(d, b), ") ", makeStatementOrBlock(d - 1, b), " else ", " if ", "(", makeExpr(d, b), ") ", makeStatementOrBlock(d - 1, b), " else ", makeStatementOrBlock(d - 1, b)]); } },

  // A tricky pair of if/else cases.
  // In the SECOND case, braces must be preserved to keep the final "else" associated with the first "if".
  { w: 1, fun: function(d, b) { return cat([maybeLabel(), "if(", makeExpr(d, b), ") ", "{", " if ", "(", makeExpr(d, b), ") ", makeStatementOrBlock(d - 1, b), " else ", makeStatementOrBlock(d - 1, b), "}"]); } },
  { w: 1, fun: function(d, b) { return cat([maybeLabel(), "if(", makeExpr(d, b), ") ", "{", " if ", "(", makeExpr(d, b), ") ", makeStatementOrBlock(d - 1, b), "}", " else ", makeStatementOrBlock(d - 1, b)]); } },

  // Expression statements
  { w: 5, fun: function(d, b) { return cat([makeExpr(d, b), ";"]); } },
  { w: 5, fun: function(d, b) { return cat(["(", makeExpr(d, b), ")", ";"]); } },

  // Exception-related statements :)
  { w: 6, fun: function(d, b) { return makeExceptionyStatement(d - 1, b) + makeExceptionyStatement(d - 1, b); } },
  { w: 7, fun: function(d, b) { return makeExceptionyStatement(d, b); } },

  // Labels. (JavaScript does not have goto, but it does have break-to-label and continue-to-label).
  { w: 1, fun: function(d, b) { return cat(["L", ": ", makeStatementOrBlock(d, b)]); } },

  // Function-declaration-statements with shared names
  { w: 10, fun: function(d, b) { return cat([makeStatement(d-2, b), "function ", makeId(d, b), "(", makeFormalArgList(d, b), ")", "{", "/*jjj*/", "}", makeStatement(d-2, b)]); } },

  // Function-declaration-statements with unique names, along with calls to those functions
  { w: 8, fun: makeNamedFunctionAndUse },

  // Long script -- can confuse Spidermonkey's short vs long jmp or something like that.
  // Spidermonkey's regexp engine is so slow for long strings that we have to bypass whatToTest :(
  //{ w: 1, fun: function(d, b) { return strTimes("try{}catch(e){}", rnd(10000)); } },
  { w: 1, fun: function(d, b) { if (rnd(200)==0) return "/*DUPTRY" + rnd(10000) + "*/" + makeStatement(d - 1, b); return ";"; } },

  // E4X "default xml namespace"
  { w: 1, fun: function(d, b) { return cat(["default ", "xml ", "namespace ", " = ", makeExpr(d, b), ";"]); } },

  { w: 1, fun: function(d, b) { return makeShapeyConstructorLoop(d, b); } },

  // Replace a variable with a long linked list pointing to it.  (Forces SpiderMonkey's GC marker into a stackless mode.)
  { w: 1, fun: function(d, b) { var x = makeId(d, b); return x + " = linkedList(" + x + ", " + (rnd(100) * rnd(100)) + ");";  } },

  // ES5 strict mode
  { w: 1, fun: function(d, b) { return '"use strict"; ' + makeStatement(d - 1, b); } },

  // Spidermonkey strict warnings
  { w: 1, fun: function(d, b) { return "(void options('strict'));" } },

  // Blocks of statements related to typed arrays
  { w: 8, fun: makeTypedArrayStatements },

  // Print statements
  { w: 8, fun: makePrintStatement },

  // Add properties
  //{ w: 3, fun: function(d, b) { return "for (var p in " + makeId(d, b) + ") { addPropertyName(p); }"; } },
  //{ w: 3, fun: function(d, b) { return "var opn = Object.getOwnPropertyNames(" + makeId(d, b) + "); for (var j = 0; j < opn.length; ++j) { addPropertyName(opn[j]); }"; } },
]);

function linkedList(x, n)
{
  for (var i = 0; i < n; ++i)
    x = {a: x};
  return x;
}

function makeNamedFunctionAndUse(d, b) {
  // Use a unique function name to make it less likely that we'll accidentally make a recursive call
  var funcName = uniqueVarName();
  var formalArgList = makeFormalArgList(d, b);
  var bv = formalArgList.length == 1 ? b.concat(formalArgList) : b;
  var declStatement = cat(["/*hhh*/function ", funcName, "(", formalArgList, ")", "{", makeStatement(d - 1, bv), "}"]);
  var useStatement;
  if (rnd(2)) {
    // Direct call
    useStatement = cat([funcName, "(", makeActualArgList(d, b), ")", ";"]);
  } else {
    // Any statement, allowed to use the name of the function
    useStatement = "/*iii*/" + makeStatement(d - 1, b.concat([funcName]));
  }
  if (rnd(2)) {
    return declStatement + useStatement;
  } else {
    return useStatement + declStatement;
  }
}

function makePrintStatement(d, b)
{
  if (rnd(2) && b.length)
    return "print(" + rndElt(b) + ");";
  else
    return "print(" + makeExpr(d, b) + ");";
}


function maybeLabel()
{
  if (rnd(4) == 1)
    return cat([rndElt(["L", "M"]), ":"]);
  else
    return "";
}


function uniqueVarName()
{
  // Make a random variable name.
  var i, s = "";
  for (i = 0; i < 6; ++i)
    s += String.fromCharCode(97 + rnd(26)); // a lowercase english letter
  return s;
}



function makeSwitchBody(d, b)
{
  if (rnd(TOTALLY_RANDOM) == 2) return totallyRandom(d, b);

  var haveSomething = false;
  var haveDefault = false;
  var output = "";

  do {

    if (!haveSomething || rnd(2)) {
      // Want a case/default (or, if this is the beginning, "need").

      if (!haveDefault && rnd(2)) {
        output += "default: ";
        haveDefault = true;
      }
      else {
        // cases with numbers (integers?) have special optimizations that affect order when decompiling,
        // so be sure to test those well in addition to testing complicated expressions.
        output += "case " + (rnd(2) ? rnd(10) : makeExpr(d, b)) + ": ";
      }

      haveSomething = true;
    }

    // Might want a statement.
    if (rnd(2))
      output += makeStatement(d, b)

    // Might want to break, or might want to fall through.
    if (rnd(2))
      output += "break; ";

    if (rnd(2))
      --d;

  } while (d && rnd(5));

  return output;
}

function makeLittleStatement(d, b)
{
  if (rnd(TOTALLY_RANDOM) == 2) return totallyRandom(d, b);

  d = d - 1;

  if (rnd(4) == 1)
    return makeStatement(d, b);

  return (rndElt(littleStatementMakers))(d, b);
}

var littleStatementMakers =
[
  // Tiny
  function(d, b) { return cat([";"]); }, // e.g. empty "if" block
  function(d, b) { return cat(["{", "}"]); }, // e.g. empty "if" block
  function(d, b) { return cat([""]); },

  // Throw stuff.
  function(d, b) { return cat(["throw ", makeExpr(d, b), ";"]); },

  // Break/continue [to label].
  function(d, b) { return cat([rndElt(["continue", "break"]), " ", rndElt(["L", "M", "", ""]), ";"]); },

  // Named and unnamed functions (which have different behaviors in different places: both can be expressions,
  // but unnamed functions "want" to be expressions and named functions "want" to be special statements)
  function(d, b) { return makeFunction(d, b); },

  // Return, yield
  function(d, b) { return cat(["return ", makeExpr(d, b), ";"]); },
  function(d, b) { return "return;"; }, // return without a value is allowed in generators; return with a value is not.
  function(d, b) { return cat(["yield ", makeExpr(d, b), ";"]); }, // note: yield can also be a left-unary operator, or something like that
  function(d, b) { return "yield;"; },

  // Expression statements
  function(d, b) { return cat([makeExpr(d, b), ";"]); },
  function(d, b) { return cat([makeExpr(d, b), ";"]); },
  function(d, b) { return cat([makeExpr(d, b), ";"]); },
  function(d, b) { return cat([makeExpr(d, b), ";"]); },
  function(d, b) { return cat([makeExpr(d, b), ";"]); },
  function(d, b) { return cat([makeExpr(d, b), ";"]); },
  function(d, b) { return cat([makeExpr(d, b), ";"]); },
  function(d, b) { return cat(["(", makeExpr(d, b), ")", ";"]); },
  function(d, b) { return cat(["(", makeExpr(d, b), ")", ";"]); },
  function(d, b) { return cat(["(", makeExpr(d, b), ")", ";"]); },
  function(d, b) { return cat(["(", makeExpr(d, b), ")", ";"]); },
  function(d, b) { return cat(["(", makeExpr(d, b), ")", ";"]); },
  function(d, b) { return cat(["(", makeExpr(d, b), ")", ";"]); },
  function(d, b) { return cat(["(", makeExpr(d, b), ")", ";"]); },
];


// makeStatementOrBlock exists because often, things have different behaviors depending on where there are braces.
// for example, if braces are added or removed, the meaning of "let" can change.
function makeStatementOrBlock(d, b)
{
  if (rnd(TOTALLY_RANDOM) == 2) return totallyRandom(d, b);

  return (rndElt(statementBlockMakers))(d - 1, b);
}

var statementBlockMakers = [
  function(d, b) { return makeStatement(d, b); },
  function(d, b) { return makeStatement(d, b); },
  function(d, b) { return cat(["{", makeStatement(d, b), " }"]); },
  function(d, b) { return cat(["{", makeStatement(d - 1, b), makeStatement(d - 1, b), " }"]); },
]


// Extra-hard testing for try/catch/finally and related things.

function makeExceptionyStatement(d, b)
{
  if (rnd(TOTALLY_RANDOM) == 2) return totallyRandom(d, b);

  d = d - 1;
  if (d < 1)
    return makeLittleStatement(d, b);

  return (rndElt(exceptionyStatementMakers))(d, b);
}

var exceptionyStatementMakers = [
  function(d, b) { return makeTryBlock(d, b); },

  function(d, b) { return makeStatement(d, b); },
  function(d, b) { return makeLittleStatement(d, b); },

  function(d, b) { return "return;" }, // return without a value can be mixed with yield
  function(d, b) { return cat(["return ", makeExpr(d, b), ";"]); },
  function(d, b) { return cat(["yield ", makeExpr(d, b), ";"]); },
  function(d, b) { return cat(["throw ", makeId(d, b), ";"]); },
  function(d, b) { return "throw StopIteration;"; },
  function(d, b) { return "this.zzz.zzz;"; }, // throws; also tests js_DecompileValueGenerator in various locations
  function(d, b) { return cat([makeId(d, b), " = ", makeId(d, b), ";"]); },
  function(d, b) { return cat([makeLValue(d, b), " = ", makeId(d, b), ";"]); },

  // Iteration uses StopIteration internally.
  // Iteration is also useful to test because it asserts that there is no pending exception.
  function(d, b) { var v = makeNewId(d, b); return "for(let " + v + " in []);"; },
  function(d, b) { var v = makeNewId(d, b); return "for(let " + v + " in " + makeMixedTypeArray(d, b) + ") " + makeExceptionyStatement(d, b.concat([v])); },

  // Brendan says these are scary places to throw: with, let block, lambda called immediately in let expr.
  // And I think he was right.
  function(d, b) { return "with({}) "   + makeExceptionyStatement(d, b);         },
  function(d, b) { return "with({}) { " + makeExceptionyStatement(d, b) + " } "; },
  function(d, b) { var v = makeNewId(d, b); return "let(" + v + ") { " + makeExceptionyStatement(d, b.concat([v])) + "}"; },
  function(d, b) { var v = makeNewId(d, b); return "let(" + v + ") ((function(){" + makeExceptionyStatement(d, b.concat([v])) + "})());" },
  function(d, b) { return "let(" + makeLetHead(d, b) + ") { " + makeExceptionyStatement(d, b) + "}"; },
  function(d, b) { return "let(" + makeLetHead(d, b) + ") ((function(){" + makeExceptionyStatement(d, b) + "})());" },

  // Commented out due to causing too much noise on stderr and causing a nonzero exit code :/
/*
  // Generator close hooks: called during GC in this case!!!
  function(d, b) { return "(function () { try { yield " + makeExpr(d, b) + " } finally { " + makeStatement(d, b) + " } })().next()"; },

  function(d, b) { return "(function () { try { yield " + makeExpr(d, b) + " } finally { " + makeStatement(d, b) + " } })()"; },
  function(d, b) { return "(function () { try { yield " + makeExpr(d, b) + " } finally { " + makeStatement(d, b) + " } })"; },
  function(d, b) {
    return "function gen() { try { yield 1; } finally { " + makeStatement(d, b) + " } } var i = gen(); i.next(); i = null;";
  }

*/
];

function makeTryBlock(d, b)
{
  if (rnd(TOTALLY_RANDOM) == 2) return totallyRandom(d, b);

  // Catches: 1/6 chance of having none
  // Catches: maybe 2 + 1/2
  // So approximately 4 recursions into makeExceptionyStatement on average!
  // Therefore we want to keep the chance of recursing too much down...

  d = d - rnd(3);


  var s = cat(["try", " { ", makeExceptionyStatement(d, b), " } "]);

  var numCatches = 0;

  while(rnd(3) == 0) {
    // Add a guarded catch, using an expression or a function call.
    ++numCatches;
    if (rnd(2))
      s += cat(["catch", "(", makeId(d, b), " if ",                 makeExpr(d, b),                    ")", " { ", makeExceptionyStatement(d, b), " } "]);
    else
      s += cat(["catch", "(", makeId(d, b), " if ", "(function(){", makeExceptionyStatement(d, b), "})())", " { ", makeExceptionyStatement(d, b), " } "]);
  }

  if (rnd(2)) {
    // Add an unguarded catch.
    ++numCatches;
    s +=   cat(["catch", "(", makeId(d, b),                                                          ")", " { ", makeExceptionyStatement(d, b), " } "]);
  }

  if (numCatches == 0 || rnd(2) == 1) {
    // Add a finally.
    s += cat(["finally", " { ", makeExceptionyStatement(d, b), " } "]);
  }

  return s;
}



// Creates a string that sorta makes sense as an expression
function makeExpr(d, b)
{
  if (rnd(TOTALLY_RANDOM) == 2) return totallyRandom(d, b);

  if (d <= 0 || (rnd(7) == 1))
    return makeTerm(d - 1, b);

  if (rnd(6) == 1 && b.length)
    return rndElt(b);

  if (rnd(10) == 1)
    return makeImmediateRecursiveCall(d, b);

  d = rnd(d); // !

  var expr = (rndElt(exprMakers))(d, b);

  if (rnd(4) == 1)
    return "(" + expr + ")";
  else
    return expr;
}

var binaryOps = [
  // Long-standing JavaScript operators, roughly in order from http://www.codehouse.com/javascript/precedence/
  " * ", " / ", " % ", " + ", " - ", " << ", " >> ", " >>> ", " < ", " > ", " <= ", " >= ", " instanceof ", " in ", " == ", " != ", " === ", " !== ",
  " & ", " | ", " ^ ", " && ", " || ", " = ", " *= ", " /= ", " %= ", " += ", " -= ", " <<= ", " >>= ", " >>>= ", " &= ", " ^= ", " |= ", " , ",

  // . is special, so test it as a group of right-unary ops, a special exprMaker for property access, and a special exprMaker for the xml filtering predicate operator
  // " . ",
];

if (haveE4X) {
  binaryOps = binaryOps.concat([
  // Binary operators added by E4X
  " :: ", " .. ", " @ ",
  // Frequent combinations of E4X things (and "*" namespace, which isn't produced by this fuzzer otherwise)
  " .@ ", " .@*:: ", " .@x:: ",
  ]);
}

var leftUnaryOps = [
  "--", "++",
  "!", "+", "-", "~",
  "void ", "typeof ", "delete ",
  "new ", // but note that "new" can also be a very strange left-binary operator
  "yield " // see http://www.python.org/dev/peps/pep-0342/ .  Often needs to be parenthesized, so there's also a special exprMaker for it.
];

var rightUnaryOps = [
  "++", "--",
];

if (haveE4X)
  rightUnaryOps = rightUnaryOps.concat([".*", ".@foo", ".@*"]);



var specialProperties = [
  "x", "y",
  "__iterator__", "__count__",
  "__noSuchMethod__",
  "__parent__", "__proto__", "constructor", "prototype",
  "wrappedJSObject",
  "length",
  // Typed arraays
  "buffer", "byteLength", "byteOffset",
  // E4X
  "ignoreComments", "ignoreProcessingInstructions", "ignoreWhitespace",
  "prettyPrinting", "prettyIndent",
  // arguments object
  "arguments", "caller", "callee",
  // Math object
  "E", "PI"
]

function makeSpecialProperty(d, b)
{
  if (rnd(TOTALLY_RANDOM) == 2) return totallyRandom(d, b);

  return rndElt(specialProperties);
}

// This makes it easier for fuzz-generated code to mess with the fuzzer. Will I regret it?
function addPropertyName(p)
{
  p = "" + p;
  if (
      p != "floor" &&
      p != "random" &&
      p != "parent" && // unsafe spidermonkey shell function, see bug 619064
      true) {
    print("Adding: " + p);
    specialProperties.push(p);
  }
}

function makeNamespacePrefix(d, b)
{
  if (rnd(TOTALLY_RANDOM) == 2) return totallyRandom(d, b);
  switch (rnd(7)) {
    case 0:  return "function::";
    case 1:  return makeId(d, b) + "::";
    default: return "";
  }
}


// An incomplete list of builtin methods for various data types.
var objectMethods = [
  // String
  "fromCharCode", "replace",

  // Strings
  "charAt", "charCodeAt", "concat", "indexOf", "lastIndexOf", "localeCompare",
  "match", "quote", "replace", "search", "slice", "split", "substr", "substring",
  "toLocaleUpperCase", "toLocaleLowerCase", "toLowerCase", "toUpperCase",

  // String methods added in ES5
  "trim", "trimLeft", "trimRight",

  // Regular expressions
  "test", "exec",

  // Arrays
  "splice", "shift", "sort", "pop", "push", "reverse", "unshift",
  "concat", "join", "slice",

  // Array extras in JavaScript 1.6
  "map", "forEach", "filter", "some", "every", "indexOf", "lastIndexOf",

  // Array extras in JavaScript 1.8
  "reduce", "reduceRight",

  // Weak Maps
  "get", "set", "delete", "has",

  // Functions
  "call", "apply",

  // Date
  "now", "parse", "UTC",

  // Date instances
  "getDate", "setDay", // many more not listed

  // Number
  "toExponential", "toFixed", "toLocaleString", "toPrecision",

  // General -- defined on each type of object, but wit a different implementation
  "toSource", "toString", "valueOf", "constructor", "prototype", "__proto__",

  // General -- same implementation inherited from Object.prototype
  "__defineGetter__", "__defineSetter__", "hasOwnProperty", "isPrototypeOf", "__lookupGetter__", "__lookupSetter__", "__noSuchMethod__", "propertyIsEnumerable", "unwatch", "watch",

  // Things that are only built-in on Object itself
  "defineProperty", "defineProperties", "create", "getOwnPropertyDescriptor", "getPrototypeOf",

  // E4X functions on XML objects
  // "parent" is commented out because of a similarly-named debugging function in the js shell (see bug 619064)
  "addNamespace", "appendChild", "attribute", "attributes", "child", "childIndex", "children", "comments", "contains", "copy", "descendants", "elements", "hasOwnProperty", "hasComplexContent", "hasSimpleContent", "isScopeNamespace", "insertChildAfter", "insertChildBefore", "length", "localName", "name", "namespace", "namespaceDeclarations", "nodeKind", "normalize", /*"parent",*/ "processingInstructions", "prependChild", "propertyIsEnumerable", "removeNamespace", "replace", "setChildren", "setLocalName", "setName", "setNamespace", "text", "toString", "toXMLString", "valueOf",

  // E4X functions on the XML constructor
  "settings", "setSettings", "defaultSettings",

  // E4X functions on the global object
  "isXMLName",
];


var exprMakers =
[
  // Left-unary operators
  function(d, b) { return cat([rndElt(leftUnaryOps), makeExpr(d, b)]); },
  function(d, b) { return cat([rndElt(leftUnaryOps), makeExpr(d, b)]); },
  function(d, b) { return cat([rndElt(leftUnaryOps), makeExpr(d, b)]); },

  // Right-unary operators
  function(d, b) { return cat([makeExpr(d, b), rndElt(rightUnaryOps)]); },
  function(d, b) { return cat([makeExpr(d, b), rndElt(rightUnaryOps)]); },
  function(d, b) { return cat([makeExpr(d, b), rndElt(rightUnaryOps)]); },

  // Special properties: we love to set them!
  function(d, b) { return cat([makeExpr(d, b), ".", makeNamespacePrefix(d, b), makeSpecialProperty(d, b)]); },
  function(d, b) { return cat([makeExpr(d, b), ".", makeNamespacePrefix(d, b), makeSpecialProperty(d, b), " = ", makeExpr(d, b)]); },
  function(d, b) { return cat([makeExpr(d, b), ".", makeNamespacePrefix(d, b), makeSpecialProperty(d, b), " = ", makeFunction(d, b)]); },
  function(d, b) { return cat([makeId(d, b),   ".", makeNamespacePrefix(d, b), makeSpecialProperty(d, b), " = ", makeExpr(d, b)]); },
  function(d, b) { return cat([makeId(d, b),   ".", makeNamespacePrefix(d, b), makeSpecialProperty(d, b), " = ", makeFunction(d, b)]); },

  // Methods
  function(d, b) { return cat([makeExpr(d, b), ".", makeNamespacePrefix(d, b), rndElt(objectMethods)]); },
  function(d, b) { var id = makeId(d, b); return cat(["/*UUV1*/", "(", id, ".", rndElt(objectMethods), " = ", makeFunction(d, b), ")"]); },
  function(d, b) { var id = makeId(d, b); return cat(["/*UUV2*/", "(", id, ".", rndElt(objectMethods), " = ", id, ".", rndElt(objectMethods), ")"]); },
  function(d, b) { return cat([makeExpr(d, b), ".", makeNamespacePrefix(d, b), rndElt(objectMethods), "(", makeActualArgList(d, b), ")"]); },
  function(d, b) { return cat([makeExpr(d, b), ".", makeNamespacePrefix(d, b), "valueOf", "(", uneval("number"), ")"]); },

  // Binary operators
  function(d, b) { return cat([makeExpr(d, b), rndElt(binaryOps), makeExpr(d, b)]); },
  function(d, b) { return cat([makeExpr(d, b), rndElt(binaryOps), makeExpr(d, b)]); },
  function(d, b) { return cat([makeExpr(d, b), rndElt(binaryOps), makeExpr(d, b)]); },
  function(d, b) { return cat([makeExpr(d, b), rndElt(binaryOps), makeExpr(d, b)]); },
  function(d, b) { return cat([makeExpr(d, b), rndElt(binaryOps), makeExpr(d, b)]); },
  function(d, b) { return cat([makeExpr(d, b), rndElt(binaryOps), makeExpr(d, b)]); },
  function(d, b) { return cat([makeExpr(d, b), rndElt(binaryOps), makeExpr(d, b)]); },
  function(d, b) { return cat([makeExpr(d, b), rndElt(binaryOps), makeExpr(d, b)]); },
  function(d, b) { return cat([makeExpr(d, b), rndElt(binaryOps), makeExpr(d, b)]); },
  function(d, b) { return cat([makeExpr(d, b), rndElt(binaryOps), makeExpr(d, b)]); },
  function(d, b) { return cat([makeId(d, b),   rndElt(binaryOps), makeId(d, b)]); },
  function(d, b) { return cat([makeId(d, b),   rndElt(binaryOps), makeId(d, b)]); },
  function(d, b) { return cat([makeId(d, b),   rndElt(binaryOps), makeId(d, b)]); },

  // Ternary operator
  function(d, b) { return cat([makeExpr(d, b), " ? ", makeExpr(d, b), " : ", makeExpr(d, b)]); },
  function(d, b) { return cat([makeExpr(d, b), " ? ", makeExpr(d, b), " : ", makeExpr(d, b)]); },

  // In most contexts, yield expressions must be parenthesized, so including explicitly parenthesized yields makes actually-compiling yields appear more often.
  function(d, b) { return cat(["yield ", makeExpr(d, b)]); },
  function(d, b) { return cat(["(", "yield ", makeExpr(d, b), ")"]); },

  // Array functions (including extras).  The most interesting are map and filter, I think.
  // These are mostly interesting to fuzzers in the sense of "what happens if i do strange things from a filter function?"  e.g. modify the array.. :)
  // This fuzzer isn't the best for attacking this kind of thing, since it's unlikely that the code in the function will attempt to modify the array or make it go away.
  // The second parameter to "map" is used as the "this" for the function.
  function(d, b) { return cat(["[11,12,13,14]",        ".", rndElt(["map", "filter", "some", "sort"]) ]); },
  function(d, b) { return cat(["[15,16,17,18]",        ".", rndElt(["map", "filter", "some", "sort"]), "(", makeFunction(d, b), ", ", makeExpr(d, b), ")"]); },
  function(d, b) { return cat(["[", makeExpr(d, b), "]", ".", rndElt(["map", "filter", "some", "sort"]), "(", makeFunction(d, b), ")"]); },

  // RegExp replace.  This is interesting for the same reason as array extras.  Also, in SpiderMonkey, the "this" argument is weird (obj.__parent__?)
  function(d, b) { return cat(["'fafafa'", ".", "replace", "(", "/", "a", "/", "g", ", ", makeFunction(d, b), ")"]); },

  // Dot (property access)
  function(d, b) { return cat([makeId(d, b),    ".", makeNamespacePrefix(d, b), makeId(d, b)]); },
  function(d, b) { return cat([makeExpr(d, b),  ".", makeNamespacePrefix(d, b), makeId(d, b)]); },

  // Property access / index into array
  function(d, b) { return cat([     makeExpr(d, b),      "[", makeExpr(d, b), "]"]); },
  function(d, b) { return cat(["(", makeExpr(d, b), ")", "[", makeExpr(d, b), "]"]); },
  function(d, b) { return cat([     makeExpr(d, b),      "[", "'_'", " + ", "(", makeExpr(d, b), ")", "]"]); },

  // Containment in an array or object (or, if this happens to end up on the LHS of an assignment, destructuring)
  function(d, b) { return cat([maybeSharpDecl(), "[", makeExpr(d, b), "]"]); },
  function(d, b) { return cat([maybeSharpDecl(), "(", "{", makeId(d, b), ": ", makeExpr(d, b), "}", ")"]); },

  // Sharps on random stuff?
  function(d, b) { return cat([maybeSharpDecl(), makeExpr(d, b)]); },

  // Functions: called immediately/not
  function(d, b) { return makeFunction(d, b); },
  function(d, b) { return makeFunction(d, b) + ".prototype"; },
  function(d, b) { return cat(["(", makeFunction(d, b), ")", "(", makeActualArgList(d, b), ")"]); },

  // Try to call things that may or may not be functions.
  function(d, b) { return cat([     makeExpr(d, b),          "(", makeActualArgList(d, b), ")"]); },
  function(d, b) { return cat(["(", makeExpr(d, b),     ")", "(", makeActualArgList(d, b), ")"]); },
  function(d, b) { return cat([     makeFunction(d, b),      "(", makeActualArgList(d, b), ")"]); },

  // Try to test function.call heavily.
  function(d, b) { return cat(["(", makeFunction(d, b), ")", ".", "call", "(", makeExpr(d, b), ", ", makeActualArgList(d, b), ")"]); },

  // Binary "new", with and without clarifying parentheses, with expressions or functions
  function(d, b) { return cat(["new ",      makeExpr(d, b),          "(", makeActualArgList(d, b), ")"]); },
  function(d, b) { return cat(["new ", "(", makeExpr(d, b), ")",     "(", makeActualArgList(d, b), ")"]); },

  function(d, b) { return cat(["new ",      makeFunction(d, b),      "(", makeActualArgList(d, b), ")"]); },
  function(d, b) { return cat(["new ", "(", makeFunction(d, b), ")", "(", makeActualArgList(d, b), ")"]); },

  // Sometimes we do crazy stuff, like putting a statement where an expression should go.  This frequently causes a syntax error.
  function(d, b) { return stripSemicolon(makeLittleStatement(d, b)); },
  function(d, b) { return ""; },

  // Let expressions -- note the lack of curly braces.
  function(d, b) { var v = makeNewId(d, b); return cat(["let ", "(", v,                            ") ", makeExpr(d - 1, b.concat([v]))]); },
  function(d, b) { var v = makeNewId(d, b); return cat(["let ", "(", v, " = ", makeExpr(d - 1, b), ") ", makeExpr(d - 1, b.concat([v]))]); },
  function(d, b) {                          return cat(["let ", "(", makeLetHead(d, b),            ") ", makeExpr(d, b)]); },

  // Array comprehensions (JavaScript 1.7)
  function(d, b) { return cat(["[", makeExpr(d, b), makeComprehension(d, b), "]"]); },

  // Generator expressions (JavaScript 1.8)
  function(d, b) { return cat([     makeExpr(d, b), makeComprehension(d, b)     ]); },
  function(d, b) { return cat(["(", makeExpr(d, b), makeComprehension(d, b), ")"]); },

  // Comments and whitespace
  function(d, b) { return cat([" /* Comment */", makeExpr(d, b)]); },
  function(d, b) { return cat(["\n", makeExpr(d, b)]); }, // perhaps trigger semicolon insertion and stuff
  function(d, b) { return cat([makeExpr(d, b), "\n"]); },

  // LValue as an expression
  function(d, b) { return cat([makeLValue(d, b)]); },

  // Assignment (can be destructuring)
  function(d, b) { return cat([     makeLValue(d, b),      " = ", makeExpr(d, b)     ]); },
  function(d, b) { return cat([     makeLValue(d, b),      " = ", makeExpr(d, b)     ]); },
  function(d, b) { return cat(["(", makeLValue(d, b),      " = ", makeExpr(d, b), ")"]); },
  function(d, b) { return cat(["(", makeLValue(d, b), ")", " = ", makeExpr(d, b)     ]); },

  // Destructuring assignment
  function(d, b) { return cat([     makeDestructuringLValue(d, b),      " = ", makeExpr(d, b)     ]); },
  function(d, b) { return cat([     makeDestructuringLValue(d, b),      " = ", makeExpr(d, b)     ]); },
  function(d, b) { return cat(["(", makeDestructuringLValue(d, b),      " = ", makeExpr(d, b), ")"]); },
  function(d, b) { return cat(["(", makeDestructuringLValue(d, b), ")", " = ", makeExpr(d, b)     ]); },

  // Destructuring assignment with lots of group assignment
  function(d, b) { return cat([makeDestructuringLValue(d, b), " = ", makeDestructuringLValue(d, b)]); },

  // Modifying assignment, with operators that do various coercions
  function(d, b) { return cat([makeLValue(d, b), rndElt(["|=", "%=", "+=", "-="]), makeExpr(d, b)]); },

  // Watchpoints (similar to setters)
  function(d, b) { return cat([makeExpr(d, b), ".", "watch", "(", uneval(makeId(d, b)), ", ", makeFunction(d, b), ")"]); },
  function(d, b) { return cat([makeExpr(d, b), ".", "unwatch", "(", uneval(makeId(d, b)), ")"]); },

  // ES5 getter/setter syntax, imperative (added in Gecko 1.9.3?)
  function(d, b) { return cat(["Object.defineProperty", "(", makeId(d, b), ", ", makePropertyName(d, b), ", ", makePropertyDescriptor(d, b), ")"]); },

  // Old getter/setter syntax, imperative
  function(d, b) { return cat([makeExpr(d, b), ".", "__defineGetter__", "(", uneval(makeId(d, b)), ", ", makeFunction(d, b), ")"]); },
  function(d, b) { return cat([makeExpr(d, b), ".", "__defineSetter__", "(", uneval(makeId(d, b)), ", ", makeFunction(d, b), ")"]); },
  function(d, b) { return cat(["this", ".", "__defineGetter__", "(", uneval(makeId(d, b)), ", ", makeFunction(d, b), ")"]); },
  function(d, b) { return cat(["this", ".", "__defineSetter__", "(", uneval(makeId(d, b)), ", ", makeFunction(d, b), ")"]); },

  // Very old getter/setter syntax, imperative (removed in Gecko 1.9.3)
  function(d, b) { return cat([makeId(d, b), ".", makeId(d, b), " ", rndElt(["getter", "setter"]), "= ", makeFunction(d, b)]); },

  // Object literal
  function(d, b) { return cat(["(", "{", makeObjLiteralPart(d, b), " }", ")"]); },
  function(d, b) { return cat(["(", "{", makeObjLiteralPart(d, b), ", ", makeObjLiteralPart(d, b), " }", ")"]); },

  // Test js_ReportIsNotFunction heavily.
  function(d, b) { return "(p={}, (p.z = " + makeExpr(d, b) + ")())"; },

  // Test js_ReportIsNotFunction heavily.
  // Test decompilation for ".keyword" a bit.
  // Test throwing-into-generator sometimes.
  function(d, b) { return cat([makeExpr(d, b), ".", "throw", "(", makeExpr(d, b), ")"]); },
  function(d, b) { return cat([makeExpr(d, b), ".", "yoyo",   "(", makeExpr(d, b), ")"]); },

  // Throws, but more importantly, tests js_DecompileValueGenerator in various contexts.
  function(d, b) { return "this.zzz.zzz"; },

  // Test eval in various contexts. (but avoid clobbering eval)
  // Test the special "obj.eval" and "eval(..., obj)" forms.
  function(d, b) { return makeExpr(d, b) + ".eval(" + makeExpr(d, b) + ")"; },
  function(d, b) { return "eval(" + uneval(makeExpr(d, b))      + ")"; },
  function(d, b) { return "eval(" + uneval(makeExpr(d, b))      + ", " + makeExpr(d, b) + ")"; },
  function(d, b) { return "eval(" + uneval(makeStatement(d, b)) + ")"; },
  function(d, b) { return "eval(" + uneval(makeStatement(d, b)) + ", " + makeExpr(d, b) + ")"; },

  // Uneval needs more testing than it will get accidentally.  No cat() because I don't want uneval clobbered (assigned to) accidentally.
  function(d, b) { return "(uneval(" + makeExpr(d, b) + "))"; },

  // Constructors.  No cat() because I don't want to screw with the constructors themselves, just call them.
  function(d, b) { return "new " + rndElt(constructors) + "(" + makeActualArgList(d, b) + ")"; },
  function(d, b) { return          rndElt(constructors) + "(" + makeActualArgList(d, b) + ")"; },
  function(d, b) { return "new Array(" + makeNumber(d, b) + ")"; },

  // Force garbage collection (global or specific compartment)
  function(d, b) { return "gc()"; },
  function(d, b) { return "gc(" + makeExpr(d, b) + ")"; },

  // Force garbage collection "soon"
  function(d, b) { return "schedulegc(" + rnd(100) + ", " + makeBoolean(d, b) + ")"; },

  // Turn on gczeal in the middle of something
  function(d, b) { return "gczeal(" + makeZealLevel() + ", " + rndElt([1, 2, rnd(100)]) + ", " + makeBoolean(d, b) + ")"; },

  // Change spidermonkey mjit chunking (see https://bugzilla.mozilla.org/show_bug.cgi?id=706914)
  function(d, b) { return "mjitChunkLimit(" + (5+rnd(4)+rnd(10)*rnd(10)) + ")"; },

  // Unary Math functions
  function (d, b) { return "Math." + rndElt(unaryMathFunctions) + "(" + makeExpr(d, b)   + ")"; },
  function (d, b) { return "Math." + rndElt(unaryMathFunctions) + "(" + makeNumber(d, b) + ")"; },

  // Binary Math functions
  function (d, b) { return "Math." + rndElt(binaryMathFunctions) + "(" + makeExpr(d, b)   + ", " + makeExpr(d, b)   + ")"; },
  function (d, b) { return "Math." + rndElt(binaryMathFunctions) + "(" + makeExpr(d, b)   + ", " + makeNumber(d, b) + ")"; },
  function (d, b) { return "Math." + rndElt(binaryMathFunctions) + "(" + makeNumber(d, b) + ", " + makeExpr(d, b)   + ")"; },
  function (d, b) { return "Math." + rndElt(binaryMathFunctions) + "(" + makeNumber(d, b) + ", " + makeNumber(d, b) + ")"; },

  // Gecko wrappers
  function(d, b) { return "new XPCNativeWrapper(" + makeExpr(d, b) + ")"; },
  function(d, b) { return "new XPCSafeJSObjectWrapper(" + makeExpr(d, b) + ")"; },

  // Harmony proxy creation: object, function without constructTrap, function with constructTrap
  function(d, b) { return makeId(d, b) + " = " + "Proxy.create(" + makeProxyHandler(d, b) + ", " + makeExpr(d, b) + ")"; },
  function(d, b) { return makeId(d, b) + " = " + "Proxy.createFunction(" + makeProxyHandler(d, b) + ", " + makeFunction(d, b) + ")"; },
  function(d, b) { return makeId(d, b) + " = " + "Proxy.createFunction(" + makeProxyHandler(d, b) + ", " + makeFunction(d, b) + ", " + makeFunction(d, b) + ")"; },

  function(d, b) { return cat(["delete", " ", makeId(d, b), ".", makeId(d, b)]); },
];

var unaryMathFunctions = ["abs", "acos", "asin", "atan", "ceil", "cos", "exp", "log", "round", "sin", "sqrt", "tan"]; // "floor" and "random" omitted -- needed by rnd
var binaryMathFunctions = ["atan2", "max", "min", "pow"]; // min and max are technically N-ary, but the generic makeFunction mechanism should give that some testing


// spidermonkey shell (but not xpcshell) has an "evalcx" function.
if (typeof evalcx == "function") {
  exprMakers = exprMakers.concat([
    // Test evalcx: sandbox creation
    function(d, b) { return "evalcx('')"; },
    function(d, b) { return "evalcx('lazy')"; },
    function(d, b) { return "evalcx('split')"; },

    // Test evalcx: sandbox use
    function(d, b) { return "evalcx(" + uneval(makeExpr(d, b))      + ", " + makeExpr(d, b) + ")"; },
    function(d, b) { return "evalcx(" + uneval(makeStatement(d, b)) + ", " + makeExpr(d, b) + ")"; },

    // Test evalcx: immediate new-global use (good for compartmentConsistencyTest)
    function(d, b) { return "evalcx(" + uneval(makeExpr(d, b))      + ", newGlobal('same-compartment'))"; },
    function(d, b) { return "evalcx(" + uneval(makeStatement(d, b)) + ", newGlobal('same-compartment'))"; },
    function(d, b) { return "evalcx(" + uneval(makeExpr(d, b))      + ", newGlobal('new-compartment'))"; },
    function(d, b) { return "evalcx(" + uneval(makeStatement(d, b)) + ", newGlobal('new-compartment'))"; },
  ]);
}

// spidermonkey shell (but not xpcshell) has a "newGlobal" function.
if (typeof newGlobal == "function") {
  exprMakers = exprMakers.concat([
    // Test multiple globals and multiple compartments.
    function(d, b) { return "newGlobal('same-compartment')"; },
    function(d, b) { return "newGlobal('new-compartment')"; }
  ]);
}

// When in xpcshell,
// * Run all testing in a sandbox so it doesn't accidentally wipe my hard drive.
// * Test interaction between sandboxes with same or different principals.
function newSandbox(n)
{
  var t = (typeof n == "number") ? n : 1;
  var s = Components.utils.Sandbox("http://x" + t + ".example.com/");

  // Allow the sandbox to do a few things
  s.newSandbox = newSandbox;
  s.evalInSandbox = function(str, sbx) { return Components.utils.evalInSandbox(str, sbx); };
  s.print = function(str) { print(str); };

  return s;
}

if ("Components" in this) {
  exprMakers = exprMakers.concat([
    function(d, b) { var n = rnd(4); return "newSandbox(" + n + ")"; },
    function(d, b) { var n = rnd(4); return "s" + n + " = newSandbox(" + n + ")"; },
    function(d, b) { var n = rnd(4); return "evalInSandbox(" + uneval(makeStatement(d, b)) + ", newSandbox(" + n + "))"; },
    function(d, b) { var n = rnd(4); return "evalInSandbox(" + uneval(makeStatement(d, b)) + ", s" + n + ")"; },
    function(d, b) { return "evalInSandbox(" + uneval(makeStatement(d, b)) + ", " + makeExpr(d, b) + ")"; },
    function(d, b) { return "(Components.classes ? quit() : gc()); }"; },
  ]);

  var primarySandbox = newSandbox(0);
}

// In addition, can always use "undefined" or makeFunction
// Forwarding proxy code based on http://wiki.ecmascript.org/doku.php?id=harmony:proxies "Example: a no-op forwarding proxy"
// The letter 'x' is special.
var proxyHandlerProperties = {
  getOwnPropertyDescriptor: {
    empty:    "function(){}",
    forward:  "function(name) { var desc = Object.getOwnPropertyDescriptor(x); desc.configurable = true; return desc; }",
    throwing: "function(name) { return {get: function() { throw 4; }, set: function() { throw 5; }}; }",
  },
  getPropertyDescriptor: {
    empty:    "function(){}",
    forward:  "function(name) { var desc = Object.getPropertyDescriptor(x); desc.configurable = true; return desc; }",
    throwing: "function(name) { return {get: function() { throw 4; }, set: function() { throw 5; }}; }",
  },
  defineProperty: {
    empty:    "function(){}",
    forward:  "function(name, desc) { Object.defineProperty(x, name, desc); }"
  },
  getOwnPropertyNames: {
    empty:    "function() { return []; }",
    forward:  "function() { return Object.getOwnPropertyNames(x); }"
  },
  delete: {
    empty:    "function() { return true; }",
    yes:      "function() { return true; }",
    no:       "function() { return false; }",
    forward:  "function(name) { return delete x[name]; }"
  },
  fix: {
    empty:    "function() { return []; }",
    yes:      "function() { return []; }",
    no:       "function() { }",
    forward:  "function() { if (Object.isFrozen(x)) { return Object.getOwnProperties(x); } }"
  },
  has: {
    empty:    "function() { return false; }",
    yes:      "function() { return true; }",
    no:       "function() { return false; }",
    forward:  "function(name) { return name in x; }"
  },
  hasOwn: {
    empty:    "function() { return false; }",
    yes:      "function() { return true; }",
    no:       "function() { return false; }",
    forward:  "function(name) { return Object.prototype.hasOwnProperty.call(x, name); }"
  },
  get: {
    empty:    "function() { return undefined }",
    forward:  "function(receiver, name) { return x[name]; }",
    bind:     "function(receiver, name) { var prop = x[name]; return (typeof prop) === 'function' ? prop.bind(x) : prop; }"
  },
  set: {
    empty:    "function() { return true; }",
    yes:      "function() { return true; }",
    no:       "function() { return false; }",
    forward:  "function(receiver, name, val) { x[name] = val; return true; }"
  },
  iterate: {
    empty:    "function() { return (function() { throw StopIteration; }); }",
    forward:  "function() { return (function() { for (var name in x) { yield name; } })(); }"
  },
  enumerate: {
    empty:    "function() { return []; }",
    forward:  "function() { var result = []; for (var name in x) { result.push(name); }; return result; }"
  },
  keys: {
    empty:    "function() { return []; }",
    forward:  "function() { return Object.keys(x); }"
  }
}

function makeProxyHandlerFactory(d, b)
{
  if (rnd(TOTALLY_RANDOM) == 2) return totallyRandom(d, b);

  try { // in case we screwed Object.prototype, breaking proxyHandlerProperties
    var preferred = rndElt(["empty", "forward", "yes", "no", "bind", "throwing"]);
    var fallback = rndElt(["empty", "forward"]);
    var fidelity = rnd(10);

    var handlerFactoryText = "(function handlerFactory(x) {";
    handlerFactoryText += "return {"

    if (rnd(2)) {
      // handlerFactory has an argument 'x'
      bp = b.concat(['x']);
    } else {
      // handlerFactory has no argument
      handlerFactoryText = handlerFactoryText.replace(/x/, "");
      bp = b;
    }

    for (var p in proxyHandlerProperties) {
      var funText;
      if (proxyHandlerProperties[p][preferred] && rnd(10) <= fidelity) {
        funText = proxyMunge(proxyHandlerProperties[p][preferred], p);
      } else {
        switch(rnd(7)) {
        case 0:  funText = makeFunction(d - 3, bp); break;
        case 1:  funText = "undefined"; break;
        case 2:  funText = "function() { throw 3; }"; break;
        default: funText = proxyMunge(proxyHandlerProperties[p][fallback], p);
        }
      }
      handlerFactoryText += p + ": " + funText + ", ";
    }

    handlerFactoryText += "}; })"

    return handlerFactoryText;
  } catch(e) {
    return "({/* :( */})";
  }
}

function proxyMunge(funText, p)
{
  funText = funText.replace(/\{/, "{ var yum = 'PCAL'; dumpln(yum + 'LED: " + p + "');");
  return funText;
}

function makeProxyHandler(d, b)
{
  if (rnd(TOTALLY_RANDOM) == 2) return totallyRandom(d, b);

  return makeProxyHandlerFactory(d, b) + "(" + makeExpr(d - 1, b) + ")"
}


function makeShapeyConstructor(d, b)
{
  if (rnd(TOTALLY_RANDOM) == 2) return totallyRandom(d, b);
  var argName = uniqueVarName();
  var t = rnd(4) ? "this" : argName;
  var funText = "function shapeyConstructor(" + argName + "){" + maybeStrict();
  var bp = b.concat([argName]);

  var nPropNames = rnd(6) + 1;
  var propNames = [];
  for (var i = 0; i < nPropNames; ++i) {
    propNames[i] = rnd(5) ? makeId(d, b) : makeSpecialProperty(d, b);
  }

  var nStatements = rnd(11);
  for (var i = 0; i < nStatements; ++i) {
    var propName = rndElt(propNames);
    if (rnd(5) == 0) {
      funText += "if (" + (rnd(2) ? argName : makeExpr(d, bp)) + ") ";
    }
    switch(rnd(8)) {
      case 0:  funText += "delete " + t + "." + propName + ";"; break;
      case 1:  funText += "Object.defineProperty(" + t + ", " + (rnd(2) ? simpleSource(propName) : makePropertyName(d, b)) + ", " + makePropertyDescriptor(d, bp) + ");"; break;
      case 2:  funText += "{ " + makeStatement(d, bp) + " } "; break;
      case 3:  funText += t + "." + propName + " = " + makeExpr(d, bp)        + ";"; break;
      case 4:  funText += t + "." + propName + " = " + makeFunction(d, bp)    + ";"; break;
      case 5:  funText += "for (var ytq" + uniqueVarName() + " in " + t + ") { }"; break;
      case 6:  funText += "Object." + rndElt(["preventExtensions","seal","freeze"]) + "(" + t + ");"; break;
      default: funText += t + "." + propName + " = " + makeShapeyValue(d, bp) + ";"; break;
    }
  }
  funText += "return " + t + "; }";
  return funText;
}

function makePropertyName(d, b)
{
  if (rnd(10) == 0)
    return "new AttributeName()";
  return simpleSource(makeId(d, b));
}

function makeShapeyConstructorLoop(d, b)
{
  var a = makeMixedTypeArray(d, b);
  var v = makeNewId(d, b);
  var v2 = uniqueVarName(d, b);
  var bvv = b.concat([v, v2]);
  return makeShapeyConstructor(d - 1, b) +
    "/*tLoopC*/for each (let " + v + " in " + a + ") { " +
     "try{" +
       "let " + v2 + " = " + rndElt(["new ", ""]) + "shapeyConstructor(" + v + "); print('EETT'); " +
       //"print(uneval(" + v2 + "));" +
       makeStatement(d - 2, bvv) +
     "}catch(e){print('TTEE ' + e); }" +
  " }";
}


function makePropertyDescriptor(d, b)
{
  if (rnd(TOTALLY_RANDOM) == 2) return totallyRandom(d, b);

  var s = "({"

  switch(rnd(3)) {
  case 0:
    // Data descriptor. Can have 'value' and 'writable'.
    if (rnd(2)) s += "value: " + makeExpr(d, b) + ", ";
    if (rnd(2)) s += "writable: " + makeBoolean(d, b) + ", ";
    break;
  case 1:
    // Accessor descriptor. Can have 'get' and 'set'.
    if (rnd(2)) s += "get: " + makeFunction(d, b) + ", ";
    if (rnd(2)) s += "set: " + makeFunction(d, b) + ", ";
    break;
  default:
  }

  if (rnd(2)) s += "configurable: " + makeBoolean(d, b) + ", ";
  if (rnd(2)) s += "enumerable: " + makeBoolean(d, b) + ", ";

  // remove trailing comma
  if (s.length > 2)
    s = s.substr(0, s.length - 2)

  s += "})";
  return s;
}

function makeBoolean(d, b)
{
  if (rnd(TOTALLY_RANDOM) == 2) return totallyRandom(d, b);
  if (rnd(10) == 0) return makeExpr(d - 2, b);
  return rndElt(["true", "false"]);
}

function makeZealLevel()
{
  // gczeal is really slow, so only turn it on very occasionally.
  if (rnd(25))
    // This sets gczeal to 0, 24-in-25 times. (96%)
    return "0";
  // If gczeal not 0, (4%)
  if (rnd(5) == 0) {
    // Do this 1-in-5 times.
    rndNumber = rnd(3);
    if (rndNumber == 0) {
      // gczeal(1) is useful almost only for embedders.
      return "1";  // do this 1-in-15 times. (6.67% of 4% = 0.2668%)
    } else if (rndNumber == 1) {
      // gczeal(3) activates when frame is shown in the browser, not really useful for shell.
      return "3";  // do this 1-in-15 times. (6.67% of 4% = 0.2668%)
    } else {
      // gczeal(5) tests write barriers when a frame is shown in the browser, not useful for shell.
      return "5";  // do this 1-in-15 times. (6.67% of 4% = 0.2668%)
    }
  } else {
    // Do this 4-in-5 times.
    if (rnd(2) == 0) {
      // gczeal(2) is the main gczeal number, do this 2-in-5 times. (40% of 4% = 1.6%)
      return "2";
    } else {
      // gczeal(4) tests write barriers, also do this 2-in-5 times. (40% of 4% = 1.6%)
      return "4";
    }
  }
}

if (haveE4X) {
  exprMakers = exprMakers.concat([
    // XML filtering predicate operator!  It isn't lexed specially; there can be a space between the dot and the lparen.
    function(d, b) { return cat([makeId(d, b),  ".", "(", makeExpr(d, b), ")"]); },
    function(d, b) { return cat([makeE4X(d, b),  ".", "(", makeExpr(d, b), ")"]); },
  ]);
}


var constructors = [
  "Error", "RangeError", "Exception",
  "Function", "RegExp", "String", "Array", "Object", "Number", "Boolean", "WeakMap",
  "Date",
  "Iterator",
  // E4X
  "Namespace", "QName", "XML", "XMLList",
  "AttributeName" // not listed as a constructor in e4x spec, but exists!
];

function maybeSharpDecl()
{
  if (rnd(3) == 0)
    return cat(["#", "" + (rnd(3)), "="]);
  else
    return "";
}


function makeObjLiteralPart(d, b)
{
  if (rnd(TOTALLY_RANDOM) == 2) return totallyRandom(d, b);

  switch(rnd(8))
  {
    // Old-style literal getter/setter
    //case 0: return cat([makeObjLiteralName(d, b), " getter: ", makeFunction(d, b)]);
    //case 1: return cat([makeObjLiteralName(d, b), " setter: ", makeFunction(d, b)]);

    // New-style literal getter/setter
    // Surprisingly, string literals, integer literals, and float literals are also good!
    // (See https://bugzilla.mozilla.org/show_bug.cgi?id=520696.)
    case 2: return cat([" get ", makeObjLiteralName(d, b), maybeName(d, b), "(", makeFormalArgList(d - 1, b), ")", makeFunctionBody(d, b)]);
    case 3: return cat([" set ", makeObjLiteralName(d, b), maybeName(d, b), "(", makeFormalArgList(d - 1, b), ")", makeFunctionBody(d, b)]);

/*
    case 3: return cat(["toString: ", makeFunction(d, b), "}", ")"]);
    case 4: return cat(["toString: function() { return this; } }", ")"]); }, // bwahaha
    case 5: return cat(["toString: function() { return " + makeExpr(d, b) + "; } }", ")"]); },
    case 6: return cat(["valueOf: ", makeFunction(d, b), "}", ")"]); },
    case 7: return cat(["valueOf: function() { return " + makeExpr(d, b) + "; } }", ")"]); },
*/

    default: return cat([makeObjLiteralName(d, b), ": ", makeExpr(d, b)]);
  }
}

function makeObjLiteralName(d, b)
{
  if (rnd(TOTALLY_RANDOM) == 2) return totallyRandom(d, b);

  switch(rnd(6))
  {
    case 0:  return simpleSource(makeNumber(d, b)); // a quoted number
    case 1:  return makeNumber(d, b);
    case 2:  return makeSpecialProperty(d, b);
    default: return makeId(d, b);
  }
}



function makeFunction(d, b)
{
  if (rnd(TOTALLY_RANDOM) == 2) return totallyRandom(d, b);

  d = d - 1;

  if(rnd(5) == 1)
    return makeExpr(d, b);

  return (rndElt(functionMakers))(d, b);
}


function maybeName(d, b)
{
  if (rnd(2) == 0)
    return " " + makeId(d, b) + " ";
  else
    return "";
}

function maybeStrict()
{
  if (rnd(3) == 0)
    return '"use strict"; ';
  return "";
}

function makeFunctionBody(d, b)
{
  if (rnd(TOTALLY_RANDOM) == 2) return totallyRandom(d, b);

  switch(rnd(4)) {
    case 0:  return cat([" { ", maybeStrict(), makeStatement(d - 1, b),   " } "]);
    case 1:  return cat([" { ", maybeStrict(), "return ", makeExpr(d, b), " } "]);
    case 2:  return cat([" { ", maybeStrict(), "yield ",  makeExpr(d, b), " } "]);
    default: return makeExpr(d, b); // make an "expression closure"
  }
}



var functionMakers = [
  // Note that a function with a name is sometimes considered a statement rather than an expression.

  // Functions and expression closures
  function(d, b) { var v = makeNewId(d, b); return cat(["function", " ", maybeName(d, b), "(", v,                       ")", makeFunctionBody(d, b.concat([v]))]); },
  function(d, b) {                          return cat(["function", " ", maybeName(d, b), "(", makeFormalArgList(d, b), ")", makeFunctionBody(d, b)]); },

  // Methods
  function(d, b) { return cat([makeExpr(d, b), ".", rndElt(objectMethods)]); },

  // The identity function
  function(d, b) { return "function(q) { return q; }" },

  // A function that does something
  function(d, b) { return "function(y) { " + makeStatement(d, b.concat(["y"])) + " }" },

  // A function that computes something
  function(d, b) { return "function(y) { return " + makeExpr(d, b.concat(["y"])) + " }" },

  // A generator that does something
  function(d, b) { return "function(y) { yield y; " + makeStatement(d, b.concat(["y"])) + "; yield y; }" },

  // A generator expression -- kinda a function??
  function(d, b) { return "(1 for (x in []))"; },

  // A simple wrapping pattern
  function(d, b) { return "/*wrap1*/(function(){ " + makeStatement(d, b) + "return " + makeFunction(d, b) + "})()" },

  // Wrapping with upvar: escaping, may or may not be modified
  function(d, b) { var v1 = uniqueVarName(); var v2 = uniqueVarName(); return "/*wrap2*/(function(){ var " + v1 + " = " + makeExpr(d, b) + "; var " + v2 + " = " + makeFunction(d, b.concat([v1])) + "; return " + v2 + ";})()"; },

  // Wrapping with upvar: non-escaping
  function(d, b) { var v1 = uniqueVarName(); var v2 = uniqueVarName(); return "/*wrap3*/(function(){ var " + v1 + " = " + makeExpr(d, b) + "; (" + makeFunction(d, b.concat([v1])) + ")(); })"; },

  // Bind
  function(d, b) { return "Function.prototype.bind" },
  function(d, b) { return "(" + makeFunction(d-1, b) + ").bind" },
  function(d, b) { return "(" + makeFunction(d-1, b) + ").bind(" + makeActualArgList(d, b) + ")" },

  // Methods with known names
  function(d, b) { return cat([makeExpr(d, b), ".", makeNamespacePrefix(d, b), rndElt(objectMethods)]); },

  // Special functions that might have interesting results, especially when called "directly" by things like string.replace or array.map.
  function(d, b) { return "eval" }, // eval is interesting both for its "no indirect calls" feature and for the way it's implemented in spidermonkey (a special bytecode).
  function(d, b) { return "(let (e=eval) e)" },
  function(d, b) { return "new Function" }, // this won't be interpreted the same way for each caller of makeFunction, but that's ok
  function(d, b) { return "(new Function(" + uneval(makeStatement(d, b)) + "))"; },
  function(d, b) { return "Function" }, // without "new"!  it does seem to work...
  function(d, b) { return "gc" },
  function(d, b) { return "Object.defineProperty" },
  function(d, b) { return "Object.defineProperties" },
  function(d, b) { return "Object.create" },
  function(d, b) { return "Object.getOwnPropertyDescriptor" },
  function(d, b) { return "Object.getOwnPropertyNames" },
  function(d, b) { return "Object.getPrototypeOf" },
  function(d, b) { return "Object.keys" },
  function(d, b) { return "Object.preventExtensions" },
  function(d, b) { return "Object.seal" },
  function(d, b) { return "Object.freeze" },
  function(d, b) { return "Object.isExtensible" },
  function(d, b) { return "Object.isSealed" },
  function(d, b) { return "Object.isFrozen" },
  function(d, b) { return "decodeURI" },
  function(d, b) { return "decodeURIComponent" },
  function(d, b) { return "encodeURI" },
  function(d, b) { return "encodeURIComponent" },
  function(d, b) { return "Array.reduce" }, // also known as Array.prototype.reduce
  function(d, b) { return "Array.isArray" },
  function(d, b) { return "JSON.parse" },
  function(d, b) { return "JSON.stringify" }, // has interesting arguments...
  function(d, b) { return "Math." + rndElt(unaryMathFunctions) },
  function(d, b) { return "Math." + rndElt(binaryMathFunctions) },
  function(d, b) { return "/a/gi" }, // in Firefox, at least, regular expressions can be used as functions: e.g. "hahaa".replace(/a+/g, /aa/g) is "hnullhaa"!
  function(d, b) { return "XPCNativeWrapper" },
  function(d, b) { return "XPCSafeJSObjectWrapper" },
  function(d, b) { return "ArrayBuffer" },
  function(d, b) { return rndElt(typedArrayConstructors); },
  function(d, b) { return "Proxy.isTrapping" },
  function(d, b) { return "Proxy.create" },
  function(d, b) { return "Proxy.createFunction" },
  function(d, b) { return "wrap" }, // spidermonkey shell shortcut for a native forwarding proxy
  function(d, b) { return makeProxyHandlerFactory(d, b); },
  function(d, b) { return makeShapeyConstructor(d, b); },
  function(d, b) { return rndElt(constructors); },
];

var typedArrayConstructors = [
  "WebGLIntArray",
  "WebGLFloatArray",
  "Int8Array",
  "Uint8Array",
  "Int16Array",
  "Uint16Array",
  "Int32Array",
  "Uint32Array",
  "Float32Array",
  "Float64Array",
  "Uint8ClampedArray"
];

function makeTypedArrayStatements(d, b)
{
  if (rnd(TOTALLY_RANDOM) == 2) return totallyRandom(d, b);

  if (d < 0) return "";

  var numViews = rnd(d) + 1;
  var numExtraStatements = rnd(d) + 1;
  var buffer = uniqueVarName();
  var bufferSize = (1 + rnd(2)) * (1 + rnd(2)) * (1 + rnd(2)) * rnd(5);
  var statements = "var " + buffer + " = new ArrayBuffer(" + bufferSize + "); ";
  var bv = b.concat([buffer]);
  for (var j = 0; j < numViews; ++j) {
    var view = buffer + "_" + j;
    var type = rndElt(typedArrayConstructors);
    statements += "var " + view + " = new " + type + "(" + buffer + "); ";
    bv.push(view);
    var view_0 = view + "[0]";
    bv.push(view_0);
    if (rnd(3) == 0)
      statements += "print(" + view_0 + "); ";
    if (rnd(3))
      statements += view_0 + " = " + makeNumber(d - 2, b) + "; ";
    bv.push(view + "[" + rnd(11) + "]");
  }
  for (var j = 0; j < numExtraStatements; ++j) {
    statements += makeStatement(d - numExtraStatements, bv);
  }
  return statements;
}

function makeNumber(d, b)
{
  if (rnd(TOTALLY_RANDOM) == 2) return totallyRandom(d, b);

  var signStr = rnd(2) ? "-" : "";

  switch(rnd(9)) {
    case 0:  return makeExpr(d - 2, b);
    case 1:  return signStr + "0";
    case 2:  return signStr + (Math.random());
    case 3:  return signStr + (Math.random() * 0xffffffff);
    case 4:  return signStr + Math.floor(Math.random() * 0xffffffff);
    case 5:  return rndElt(["0.1", ".2", "3", "1.3", "4.", "5.0000000000000000000000", "1.2e3", "1e81", "1e+81", "1e-81", "1e4", "0", "-0", "(-0)", "-1", "(-1)", "0x99", "033", "3.141592653589793", "3/0", "-3/0", "0/0", "0x2D413CCC", "0x5a827999", "0xB504F332", "(0x50505050 >> 1)", "0x80000000"]);
    default: return signStr + (Math.pow(2, rnd(66)) + (rnd(3) - 1));
  }
}

/*
David Anderson suggested creating the following recursive structures:
  - recurse down an array of mixed types, car cdr kinda thing
  - multiple recursive calls in a function, like binary search left/right, sometimes calls neither and sometimes calls both

  the recursion support in spidermonkey only works with self-recursion.
  that is, two functions that call each other recursively will not be traced.

  two trees are formed, going down and going up.
  type instability matters on both sides.
  so the values returned from the function calls matter.

  so far, what i've thought of means recursing from the top of a function and if..else.
  but i'd probably also want to recurse from other points, e.g. loops.

  special code for tail recursion likely coming soon, but possibly as a separate patch, because it requires changes to the interpreter.
*/

// "@" indicates a point at which a statement can be inserted. XXX allow use of variables, as consts
// variable names will be replaced, and should be uppercase to reduce the chance of matching things they shouldn't.
// take care to ensure infinite recursion never occurs unexpectedly, especially with doubly-recursive functions.
var recursiveFunctions = [
  {
    // Unless the recursive call is in the tail position, this will throw.
    text: "(function too_much_recursion(depth) { @; if (depth > 0) { @; too_much_recursion(depth - 1); } @ })",
    vars: ["depth"],
    args: function(d, b) { return rnd(10000); },
    test: function(f) { try { f(5000); } catch(e) { } return true; }
  },
  {
    text: "(function factorial(N) { @; if (N == 0) return 1; @; return N * factorial(N - 1); @ })",
    vars: ["N"],
    args: function(d, b) { return "" + rnd(20); },
    test: function(f) { return f(10) == 3628800; }
  },
  {
    text: "(function factorial_tail(N, Acc) { @; if (N == 0) { @; return Acc; } @; return factorial_tail(N - 1, Acc * N); @ })",
    vars: ["N", "Acc"],
    args: function(d, b) { return rnd(20) + ", 1"; },
    test: function(f) { return f(10, 1) == 3628800; }
  },
  {
    // two recursive calls
    text: "(function fibonacci(N) { @; if (N <= 1) { @; return 1; } @; return fibonacci(N - 1) + fibonacci(N - 2); @ })",
    vars: ["N"],
    args: function(d, b) { return "" + rnd(8); },
    test: function(f) { return f(6) == 13; }
  },
  {
    // do *anything* while indexing over mixed-type arrays
    text: "(function a_indexing(array, start) { @; if (array.length == start) { @; return EXPR1; } var thisitem = array[start]; var recval = a_indexing(array, start + 1); STATEMENT1 })",
    vars: ["array", "start", "thisitem", "recval"],
    args: function(d, b) { return makeMixedTypeArray(d-1, b) + ", 0"; },
    testSub: function(text) { return text.replace(/EXPR1/, "0").replace(/STATEMENT1/, "return thisitem + recval;"); },
    randSub: function(text, varMap, d, b) {
        var expr1 =      makeExpr(d, b.concat([varMap["array"], varMap["start"]]));
        var statement1 = rnd(2) ?
                                   makeStatement(d, b.concat([varMap["thisitem"], varMap["recval"]]))        :
                            "return " + makeExpr(d, b.concat([varMap["thisitem"], varMap["recval"]])) + ";";

        return (text.replace(/EXPR1/,      expr1)
                    .replace(/STATEMENT1/, statement1)
        ); },
    test: function(f) { return f([1,2,3,"4",5,6,7], 0) == "123418"; }
  },
  {
    // this lets us play a little with mixed-type arrays
    text: "(function sum_indexing(array, start) { @; return array.length == start ? 0 : array[start] + sum_indexing(array, start + 1); })",
    vars: ["array", "start"],
    args: function(d, b) { return makeMixedTypeArray(d-1, b) + ", 0"; },
    test: function(f) { return f([1,2,3,"4",5,6,7], 0) == "123418"; }
  },
  {
    text: "(function sum_slicing(array) { @; return array.length == 0 ? 0 : array[0] + sum_slicing(array.slice(1)); })",
    vars: ["array"],
    args: function(d, b) { return makeMixedTypeArray(d-1, b); },
    test: function(f) { return f([1,2,3,"4",5,6,7]) == "123418"; }
  }
];

(function testAllRecursiveFunctions() {
  for (var i = 0; i < recursiveFunctions.length; ++i) {
    var a = recursiveFunctions[i];
    var text = a.text;
    if (a.testSub) text = a.testSub(text);
    var f = eval(text.replace(/@/g, ""))
    if (!a.test(f))
      throw "Failed test of: " + a.text;
  }
})();

function makeImmediateRecursiveCall(d, b, cheat1, cheat2)
{
  if (rnd(10) != 0)
    return "(4277)";

  var a = (cheat1 == null) ? rndElt(recursiveFunctions) : recursiveFunctions[cheat1];
  var s = a.text;
  var varMap = {};
  for (var i = 0; i < a.vars.length; ++i) {
    var prettyName = a.vars[i];
    varMap[prettyName] = uniqueVarName();
    s = s.replace(new RegExp(prettyName, "g"), varMap[prettyName]);
  }
  var actualArgs = cheat2 == null ? a.args(d, b) : cheat2;
  s = s + "(" + actualArgs + ")";
  s = s.replace(/@/g, function() { if (rnd(4) == 0) return makeStatement(d-2, b); return ""; });
  if (a.randSub) s = a.randSub(s, varMap, d, b);
  s = "(" + s + ")";
  return s;
}

function makeLetHead(d, b)
{
  if (rnd(TOTALLY_RANDOM) == 2) return totallyRandom(d, b);

  var items = (d > 0 || rnd(2) == 0) ? rnd(10) + 1 : 1;
  var result = "";

  for (var i = 0; i < items; ++i) {
    if (i > 0)
      result += ", ";
    result += makeLetHeadItem(d - i, b);
  }

  return result;
}

function makeLetHeadItem(d, b)
{
  if (rnd(TOTALLY_RANDOM) == 2) return totallyRandom(d, b);

  d = d - 1;

  if (d < 0 || rnd(2) == 0)
    return rnd(2) ? uniqueVarName() : makeId(d, b);
  else if (rnd(5) == 0)
    return makeDestructuringLValue(d, b) + " = " + makeExpr(d, b);
  else
    return makeId(d, b) + " = " + makeExpr(d, b);
}


function makeActualArgList(d, b)
{
  if (rnd(TOTALLY_RANDOM) == 2) return totallyRandom(d, b);

  var nArgs = rnd(3);

  if (nArgs == 0)
    return "";

  var argList = makeExpr(d, b);

  for (var i = 1; i < nArgs; ++i)
    argList += ", " + makeExpr(d - i, b);

  return argList;
}

function makeFormalArgList(d, b)
{
  if (rnd(TOTALLY_RANDOM) == 2) return totallyRandom(d, b);

  var nArgs = rnd(3);

  if (nArgs == 0)
    return "";

  var argList = makeFormalArg(d, b)

  for (var i = 1; i < nArgs; ++i)
    argList += ", " + makeFormalArg(d - i, b);

  return argList;
}

function makeFormalArg(d, b)
{
  if (rnd(TOTALLY_RANDOM) == 2) return totallyRandom(d, b);

  if (rnd(4) == 1)
    return makeDestructuringLValue(d, b);

  return makeId(d, b);
}


function makeNewId(d, b)
{
  if (rnd(TOTALLY_RANDOM) == 2) return totallyRandom(d, b);

  return rndElt(["a", "b", "c", "d", "e", "w", "x", "y", "z"]);
}

function makeId(d, b)
{
  if (rnd(TOTALLY_RANDOM) == 2) return totallyRandom(d, b);

  if (rnd(3) == 1 && b.length)
    return rndElt(b);

  switch(rnd(200))
  {
  case 0:
    return makeTerm(d, b);
  case 1:
    return makeExpr(d, b);
  case 2: case 3: case 4: case 5:
    return makeLValue(d, b);
  case 6: case 7:
    return makeDestructuringLValue(d, b);
  case 8: case 9: case 10:
    // some keywords that can be used as identifiers in some contexts (e.g. variables, function names, argument names)
    // but that's annoying, and some of these cause lots of syntax errors.
    return rndElt(["get", "set", "getter", "setter", "delete", "let", "yield", "each", "xml", "namespace"]);
  case 11:
    return "function::" + makeId(d, b);
  case 12: case 13:
    return "this." + makeId(d, b);
  case 14:
    return "x::" + makeId(d, b);
  case 15: case 16:
    return makeNamespacePrefix(d - 1, b) + makeSpecialProperty(d - 1, b);
  case 17: case 18:
    return makeNamespacePrefix(d - 1, b) + makeId(d - 1, b);
  case 19:
    return " "; // [k, v] becomes [, v] -- test how holes are handled in unexpected destructuring
  case 20:
    return "this";
  }

  return rndElt(["a", "b", "c", "d", "e", "w", "x", "y", "z",
                 "window", "eval", "\u3056", "NaN",
//                 "valueOf", "toString", // e.g. valueOf getter :P // bug 381242, etc
                 "functional", // perhaps decompiler code looks for "function"?
                  ]);

  // window is a const (in the browser), so some attempts to redeclare it will cause errors

  // eval is interesting because it cannot be called indirectly. and maybe also because it has its own opcode in jsopcode.tbl.
  // but bad things happen if you have "eval setter"... so let's not put eval in this list.
}


function makeComprehension(d, b)
{
  if (rnd(TOTALLY_RANDOM) == 2) return totallyRandom(d, b);

  if (d < 0)
    return "";

  switch(rnd(5)) {
  case 0:
    return "";
  case 1:
    return cat([" for ",          "(", makeForInLHS(d, b), " in ", makeExpr(d - 2, b),           ")"]) + makeComprehension(d - 1, b);
  case 2:
    return cat([" for ", "each ", "(", makeId(d, b),       " in ", makeExpr(d - 2, b),           ")"]) + makeComprehension(d - 1, b);
  case 3:
    return cat([" for ", "each ", "(", makeId(d, b),       " in ", makeMixedTypeArray(d - 2, b), ")"]) + makeComprehension(d - 1, b);
  default:
    return cat([" if ", "(", makeExpr(d - 2, b), ")"]); // this is always last (and must be preceded by a "for", oh well)
  }
}




// for..in LHS can be a single variable OR it can be a destructuring array of exactly two elements.
function makeForInLHS(d, b)
{
  if (rnd(TOTALLY_RANDOM) == 2) return totallyRandom(d, b);

// JS 1.7 only (removed in JS 1.8)
//
//  if (version() == 170 && rnd(4) == 0)
//    return cat(["[", makeLValue(d, b), ", ", makeLValue(d, b), "]"]);

  return makeLValue(d, b);
}


function makeLValue(d, b)
{
  if (rnd(TOTALLY_RANDOM) == 2) return totallyRandom(d, b);

  if (d <= 0 || (rnd(2) == 1))
    return makeId(d - 1, b);

  d = rnd(d); // !

  return (rndElt(lvalueMakers))(d, b);
}


var lvalueMakers = [
  // Simple variable names :)
  function(d, b) { return cat([makeId(d, b)]); },

  // Destructuring
  function(d, b) { return makeDestructuringLValue(d, b); },
  function(d, b) { return "(" + makeDestructuringLValue(d, b) + ")"; },

  // Properties
  function(d, b) { return cat([makeId(d, b), ".", makeId(d, b)]); },
  function(d, b) { return cat([makeExpr(d, b), ".", makeId(d, b)]); },
  function(d, b) { return cat([makeExpr(d, b), "[", "'", makeId(d, b), "'", "]"]); },

  // Special properties
  function(d, b) { return cat([makeId(d, b), ".", makeSpecialProperty(d, b)]); },

  // Certain functions can act as lvalues!  See JS_HAS_LVALUE_RETURN in js engine source.
  function(d, b) { return cat([makeId(d, b), "(", makeExpr(d, b), ")"]); },
  function(d, b) { return cat(["(", makeExpr(d, b), ")", "(", makeExpr(d, b), ")"]); },

  // Parenthesized lvalues can cause problems ;)
  function(d, b) { return cat(["(", makeLValue(d, b), ")"]); },

  function(d, b) { return makeExpr(d, b); } // intentionally bogus, but not quite garbage.
];

function makeDestructuringLValue(d, b)
{
  if (rnd(TOTALLY_RANDOM) == 2) return totallyRandom(d, b);

  d = d - 1;

  if (d < 0 || rnd(4) == 1)
    return makeId(d, b);

  if (rnd(6) == 1)
    return makeLValue(d, b);

  return (rndElt(destructuringLValueMakers))(d, b);
}

var destructuringLValueMakers = [
  // destructuring assignment: arrays
  function(d, b)
  {
    var len = rnd(d, b);
    if (len == 0)
      return "[]";

    var Ti = [];
    Ti.push("[");
    Ti.push(maybeMakeDestructuringLValue(d, b));
    for (var i = 1; i < len; ++i) {
      Ti.push(", ");
      Ti.push(maybeMakeDestructuringLValue(d, b));
    }

    Ti.push("]");

    return cat(Ti);
  },

  // destructuring assignment: objects
  function(d, b)
  {
    var len = rnd(d, b);
    if (len == 0)
      return "{}";
    var Ti = [];
    Ti.push("{");
    for (var i = 0; i < len; ++i) {
      if (i > 0)
        Ti.push(", ");
      Ti.push(makeId(d, b));
      if (rnd(3)) {
        Ti.push(": ");
        Ti.push(makeDestructuringLValue(d, b));
      } // else, this is a shorthand destructuring, treated as "id: id".
    }
    Ti.push("}");

    return cat(Ti);
  }
];

// Allow "holes".
function maybeMakeDestructuringLValue(d, b)
{
  if (rnd(2) == 0)
    return ""

  return makeDestructuringLValue(d, b)
}



function makeTerm(d, b)
{
  if (rnd(TOTALLY_RANDOM) == 2) return totallyRandom(d, b);

  return (rndElt(termMakers))(d, b);
}

var termMakers = [
  // Variable names
  function(d, b) { return makeId(d, b); },

  // Simple literals (no recursion required to make them)
  function(d, b) { return rndElt([
    // Arrays
    "[]", "[1]", "[[]]", "[[1]]", "[,]", "[,,]", "[1,,]",
    // Objects
    "{}", "({})", "({a1:1})",
    // Possibly-destructuring arrays
    "[z1]", "[z1,,]", "[,,z1]",
    // Possibly-destructuring objects
    "({a2:z2})",
    // Sharp use
    "#1#",
    // Sharp creation and use
    "#1=[#1#]", "#3={a:#3#}",
    "function(id) { return id }",
    "function ([y]) { }",
    "(function ([y]) { })()",

    "arguments",
    "Math",
    "this",
    "length"
    ]);
  },
  makeNumber,
  function(d, b) { return rndElt([ "true", "false", "undefined", "null"]); },
  function(d, b) { return rndElt([ "this", "window" ]); },
  function(d, b) { return rndElt([" \"\" ", " '' "]) },
  randomUnitStringLiteral,
  function(d, b) { return rndElt([" /x/ ", " /x/g "]) },
];

function randomUnitStringLiteral()
{
  var s = "\"\\u";
  var nDigits = rnd(6) + 1;
  for (var i = 0; i < nDigits; ++i) {
    s += "0123456789ABCDEF".charAt(rnd(16));
  }
  s += "\""
  return s;
}

if (haveE4X) {
  // E4X literals
  termMakers = termMakers.concat([
  function(d, b) { return rndElt([ "<x/>", "<y><z/></y>"]); },
  function(d, b) { return rndElt([ "@foo" /* makes sense in filtering predicates, at least... */, "*", "*::*"]); },
  function(d, b) { return makeE4X(d, b) }, // xml
  function(d, b) { return cat(["<", ">", makeE4X(d, b), "<", "/", ">"]); }, // xml list
  ]);
}


function maybeMakeTerm(d, b)
{
  if (rnd(2))
    return makeTerm(d - 1, b);
  else
    return "";
}


function makeCrazyToken()
{
  if (rnd(3) == 0) {
    return String.fromCharCode(32 + rnd(128 - 32));
  }
  if (rnd(6) == 0) {
    return String.fromCharCode(rnd(65536));
  }

  return rndElt([

  // Some of this is from reading jsscan.h.

  // Comments; comments hiding line breaks.
  "//", UNTERMINATED_COMMENT, (UNTERMINATED_COMMENT + "\n"), "/*\n*/",

  // groupers (which will usually be unmatched if they come from here ;)
  "[", "]",
  "{", "}",
  "(", ")",

  // a few operators
  "!", "@", "%", "^", "*", "|", ":", "?", "'", "\"", ",", ".", "/",
  "~", "_", "+", "=", "-", "++", "--", "+=", "%=", "|=", "-=",
  "#", "#1", "#1=", // usually an "invalid character", but used as sharps too

  // most real keywords plus a few reserved keywords
  " in ", " instanceof ", " let ", " new ", " get ", " for ", " if ", " else ", " else if ", " try ", " catch ", " finally ", " export ", " import ", " void ", " with ",
  " default ", " goto ", " case ", " switch ", " do ", " /*infloop*/while ", " return ", " yield ", " break ", " continue ", " typeof ", " var ", " const ",

  // several keywords can be used as identifiers. these are just a few of them.
  " enum ", // JS_HAS_RESERVED_ECMA_KEYWORDS
  " debugger ", // JS_HAS_DEBUGGER_KEYWORD
  " super ", // TOK_PRIMARY!

  " this ", // TOK_PRIMARY!
  " null ", // TOK_PRIMARY!
  " undefined ", // not a keyword, but a default part of the global object
  "\n", // trigger semicolon insertion, also acts as whitespace where it might not be expected
  "\r",
  "\u2028", // LINE_SEPARATOR?
  "\u2029", // PARA_SEPARATOR?
  "<" + "!" + "--", // beginning of HTML-style to-end-of-line comment (!)
  "--" + ">", // end of HTML-style comment
  "",
  "\0", // confuse anything that tries to guess where a string ends. but note: "illegal character"!
  ]);
}


function makeE4X(d, b)
{
  if (rnd(TOTALLY_RANDOM) == 2) return totallyRandom(d, b);

  if (d <= 0)
    return cat(["<", "x", ">", "<", "y", "/", ">", "<", "/", "x", ">"]);

  d = d - 1;

  var y = [
    function(d, b) { return '<employee id="1"><name>Joe</name><age>20</age></employee>' },
    function(d, b) { return cat(["<", ">", makeSubE4X(d, b), "<", "/", ">"]); }, // xml list

    function(d, b) { return cat(["<", ">", makeExpr(d, b), "<", "/", ">"]); }, // bogus or text
    function(d, b) { return cat(["<", "zzz", ">", makeExpr(d, b), "<", "/", "zzz", ">"]); }, // bogus or text

    // mimic parts of this example at a time, from the e4x spec: <x><{tagname} {attributename}={attributevalue+attributevalue}>{content}</{tagname}></x>;

    function(d, b) { var tagId = makeId(d, b); return cat(["<", "{", tagId, "}", ">", makeSubE4X(d, b), "<", "/", "{", tagId, "}", ">"]); },
    function(d, b) { var attrId = makeId(d, b); var attrValExpr = makeExpr(d, b); return cat(["<", "yyy", " ", "{", attrId, "}", "=", "{", attrValExpr, "}", " ", "/", ">"]); },
    function(d, b) { var contentId = makeId(d, b); return cat(["<", "yyy", ">", "{", contentId, "}", "<", "/", "yyy", ">"]); },

    // namespace stuff
    function(d, b) { var contentId = makeId(d, b); return cat(['<', 'bbb', ' ', 'xmlns', '=', '"', makeExpr(d, b), '"', '>', makeSubE4X(d, b), '<', '/', 'bbb', '>']); },
    function(d, b) { var contentId = makeId(d, b); return cat(['<', 'bbb', ' ', 'xmlns', ':', 'ccc', '=', '"', makeExpr(d, b), '"', '>', '<', 'ccc', ':', 'eee', '>', '<', '/', 'ccc', ':', 'eee', '>', '<', '/', 'bbb', '>']); },

    function(d, b) { return makeExpr(d, b); },

    function(d, b) { return makeSubE4X(d, b); }, // naked cdata things, etc.
  ]

  return (rndElt(y))(d, b);
}

function makeSubE4X(d, b)
{
  if (rnd(TOTALLY_RANDOM) == 2) return totallyRandom(d, b);

// Bug 380431
//  if (rnd(8) == 0)
//    return "<" + "!" + "[" + "CDATA[" + makeExpr(depth - 1) + "]" + "]" + ">"

  if (d < -2)
    return "";

  var y = [
    function(d, b) { return cat(["<", "ccc", ":", "ddd", ">", makeSubE4X(d - 1, b), "<", "/", "ccc", ":", "ddd", ">"]); },
    function(d, b) { return makeE4X(d, b) + makeSubE4X(d - 1, b); },
    function(d, b) { return "yyy"; },
    function(d, b) { return cat(["<", "!", "--", "yy", "--", ">"]); }, // XML comment
// Bug 380431
//    function(depth) { return cat(["<", "!", "[", "CDATA", "[", "zz", "]", "]", ">"]); }, // XML cdata section
    function(d, b) { return " "; },
    function(d, b) { return ""; },
  ];

  return (rndElt(y))(d, b);
}

function makeShapeyValue(d, b)
{
  if (rnd(TOTALLY_RANDOM) == 2) return totallyRandom(d, b);

  if (rnd(10) == 0)
    return makeExpr(d, b);

  var a = [
    // Numbers and number-like things
    [
    "0", "1", "2", "3", "0.1", ".2", "1.3", "4.", "5.0000000000000000000000",
    "1.2e3", "1e81", "1e+81", "1e-81", "1e4", "-0", "(-0)",
    "-1", "(-1)", "0x99", "033", "3/0", "-3/0", "0/0",
    "Math.PI",
    "0x2D413CCC", "0x5a827999", "0xB504F332", "-0x2D413CCC", "-0x5a827999", "-0xB504F332", "0x50505050", "(0x50505050 >> 1)",
    // various powers of two, with values near JSVAL_INT_MAX especially tested
    "0x10000000", "0x20000000", "0x3FFFFFFE", "0x3FFFFFFF", "0x40000000", "0x40000001", "0x80000000", "-0x80000000",
    ],

    // Special numbers
    [ "(1/0)", "(-1/0)", "(0/0)" ],

    // String literals
    [" \"\" ", " '' ", " 'A' ", " '\\0' ", ' "use strict" '],

    // Regular expression literals
    [ " /x/ ", " /x/g "],

    // Booleans
    [ "true", "false" ],

    // Undefined and null
    [ "(void 0)", "null" ],

    // Object literals
    [ "[]", "[1]", "[(void 0)]", "{}", "{x:3}", "({})", "({x:3})" ],

    // Variables that really should have been constants in the ecmascript spec
    [ "NaN", "Infinity", "-Infinity", "undefined"],

    // Boxed booleans
    [ "new Boolean(true)", "new Boolean(false)" ],

    // Boxed numbers
    [ "new Number(1)", "new Number(1.5)" ],

    // Boxed strings
    [ "new String('')", "new String('q')" ],

    // Fun stuff
    [ "function(){}"],
    ["{}", "[]", "[1]", "['z']", "[undefined]", "this", "eval", "arguments", "arguments.caller", "arguments.callee" ],

    // Actual variables (slightly dangerous)
    [ b.length ? rndElt(b) : "x" ]
  ];

  return rndElt(rndElt(a));
}

function makeMixedTypeArray(d, b)
{
  // Pick two to five of those
  var q = rnd(4) + 2;
  var picks = [];
  for (var j = 0; j < q; ++j)
    picks.push(makeShapeyValue(d, b));

  // Make an array of up to 39 elements, containing those two to five values
  var c = [];
  var count = rnd(rnd(HOTLOOP + 32));
  for (var j = 0; j < count; ++j)
    c.push(rndElt(picks));

  return "[" + c.join(", ") + "]";
}

function strTimes(s, n)
{
  if (n == 0) return "";
  if (n == 1) return s;
  var s2 = s + s;
  var r = n % 2;
  var d = (n - r) / 2;
  var m = strTimes(s2, d);
  return r ? m + s : m;
}




var count = 0;
var verbose = false;


var maxHeapCount = 0;
var sandbox = null;
// https://bugzilla.mozilla.org/show_bug.cgi?id=394853#c19
//try { eval("/") } catch(e) { }
// Remember the number of countHeap.
tryItOut("");




/*
// Aggressive test for type-unstable arrays
count = 1;
for (var j = 0; j < 20000; ++j) {
  x = null;
  if (j % 100 == 0) gc();
  var a = makeMixedTypeArray();
  print(uneval(a));
  var s = "for each (let i in " + a + ") { }";
  //var s = "[i for each (i in " + a + ") if (i)]";
  eval(s);
}
throw 1;
*/


/**************************************
 * To reproduce a crash or assertion: *
 **************************************/

// 1. grep tryIt LOGFILE | grep -v "function tryIt" | pbcopy
// 2. Paste the result between "ddbegin" and "ddend", replacing "start(this);"
// 3. Run Lithium to remove unnecessary lines between "ddbegin" and "ddend".
// SPLICE DDBEGIN
start(this);
// SPLICE DDEND

if (jsshell)
  print("It's looking good!"); // Magic string that jsunhappy.py looks for


// 3. Run it.
