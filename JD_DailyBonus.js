/*************************
京东每日任务脚本（JS 版，适配 GitHub Actions / Node.js / QX / Surge / Loon）
基于青龙 Python 脚本逻辑改写，保留 NobyDa 脚本风格
有效接口：signBeanIndex/signBeanAct（App签到）、beanHomeIconDoTask（逛首页）、beanTaskList/beanDoTask（做任务）
更新时间：2026-11
*************************/

var LogDetails = false;      // 是否输出响应日志
var stop = '0';              // 任务间延迟，'2000' 或 '2000-5000'，0 为并发无延迟
var DeleteCookie = false;    // 是否清除所有 Cookie
var boxdis = true;           // 是否开启崩溃自动禁用
var ReDis = false;           // 是否移除禁用列表
var out = 0;                 // 接口超时退出（毫秒），0 关闭

var $nobyda = nobyda();
var merge = {};
var KEY = '';

var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1';

async function all(cookie) {
  KEY = cookie;
  merge = {};
  $nobyda.num++;

  await Promise.all([
    JingDongBean(stop),        // App 签到领京豆
    BeanHomeTask(stop),        // 逛首页领京豆
    BeanTasks(stop),           // 做任务赚京豆
    TotalBean(),               // 总京豆查询
  ]);

  await notify();
}

function notify() {
  return new Promise(resolve => {
    try {
      var bean = 0, success = 0, fail = 0, err = 0, notifyMsg = '';
      for (var i in merge) {
        bean += merge[i].bean ? Number(merge[i].bean) : 0;
        success += merge[i].success ? Number(merge[i].success) : 0;
        fail += merge[i].fail ? Number(merge[i].fail) : 0;
        err += merge[i].error ? Number(merge[i].error) : 0;
        notifyMsg += merge[i].notify ? "\n" + merge[i].notify : "";
      }
      var beans = merge.TotalBean && merge.TotalBean.Qbear ? `${merge.TotalBean.Qbear}京豆` : "";
      var Tbean = bean ? `${bean.toFixed(0)}京豆` : "";
      var Ts = success ? `成功${success}个${fail || err ? ", " : ""}` : "";
      var Tf = fail ? `失败${fail}个${err ? ", " : ""}` : "";
      var Te = err ? `错误${err}个` : "";
      var one = `【签到概览】:  ${Ts + Tf + Te}${Ts || Tf || Te ? `\n` : `获取失败\n`}`;
      var two = Tbean ? `【签到奖励】:  ${Tbean}\n` : "";
      var four = `【账号总计】:  ${beans}${beans ? `\n` : `获取失败\n`}`;
      var DName = merge.TotalBean && merge.TotalBean.nickname ? merge.TotalBean.nickname : "获取失败";
      var cnNum = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
      const Name = $nobyda.num > 1 || $nobyda.multiAccount ? `【签到号${cnNum[$nobyda.num] || $nobyda.num}】:  ${DName}\n` : ``;
      const fullText = Name + one + two + four + notifyMsg;

      $nobyda.notify("", "", fullText, {
        'media-url': $nobyda.headUrl || 'https://cdn.jsdelivr.net/gh/NobyDa/mini@master/Color/jd.png'
      });

      // GitHub Actions 运行摘要
      try {
        if (typeof process !== 'undefined' && process.env && process.env.GITHUB_STEP_SUMMARY) {
          const fs = require('fs');
          fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n## 京东签到结果\n\n\`\`\`\n${fullText}\n\`\`\`\n`);
        }
      } catch (e) {}

      $nobyda.headUrl = null;
    } catch (eor) {
      $nobyda.notify("通知模块 " + eor.name + "‼️", JSON.stringify(eor), eor.message);
    } finally {
      resolve();
    }
  });
}

(async function ReadCookie() {
  const EnvInfo3 = "CookiesJD";
  if (DeleteCookie) {
    const write = $nobyda.write("", EnvInfo3);
    throw new Error(`Cookie清除${write ? `成功` : `失败`}, 请手动关闭脚本内"DeleteCookie"选项`);
  }

  // 优先读环境变量 JD_COOKIE（GitHub Actions Secrets / 青龙 / 本地）
  let envCookies = [];
  try {
    const raw = (typeof process !== 'undefined' && process.env && process.env.JD_COOKIE) ? process.env.JD_COOKIE.trim() : '';
    if (raw) envCookies = raw.split(/[&\n]+/).map(s => s.trim()).filter(s => s);
  } catch (e) {}

  let cookieSet = [];
  try {
    cookieSet = JSON.parse($nobyda.read(EnvInfo3) || '[]');
  } catch (e) { cookieSet = []; }

  let allCookies = [];
  if (envCookies.length) {
    envCookies.forEach(c => allCookies.push({ cookie: c }));
  } else {
    allCookies = cookieSet;
  }

  if ($nobyda.isRequest) {
    GetCookie();
  } else if (allCookies.length) {
    if (($nobyda.isJSBox || $nobyda.isNode) && stop !== '0') $nobyda.write(stop, "JD_DailyBonusDelay");
    out = parseInt($nobyda.read("JD_DailyBonusTimeOut")) || out;
    stop = Wait($nobyda.read("JD_DailyBonusDelay"), true) || Wait(stop, true);
    boxdis = $nobyda.read("JD_Crash_disable") === "false" || $nobyda.isNode || $nobyda.isJSBox ? false : boxdis;
    LogDetails = $nobyda.read("JD_DailyBonusLog") === "true" || LogDetails;
    ReDis = ReDis ? $nobyda.write("", "JD_DailyBonusDisables") : "";

    // 随机延迟防风控（JD_DELAY_MAX 单位分钟，0 关闭）
    let delayMax = 5;
    try {
      const v = (typeof process !== 'undefined' && process.env && process.env.JD_DELAY_MAX) ? parseInt(process.env.JD_DELAY_MAX) : 5;
      if (!isNaN(v) && v >= 0) delayMax = v;
    } catch (e) {}
    if (delayMax > 0) {
      const delay = Math.floor(Math.random() * (delayMax * 60 + 1));
      console.log(`\n== 防风控：随机延迟 ${Math.floor(delay / 60)} 分 ${delay % 60} 秒后开始 ==`);
      await new Promise(r => setTimeout(r, delay * 1000));
    }

    $nobyda.num = 0;
    $nobyda.multiAccount = allCookies.length > 1;
    for (let i = 0; i < allCookies.length; i++) {
      const ck = allCookies[i].cookie;
      if (ck) await all(ck);
    }
    $nobyda.time();
  } else {
    throw new Error('脚本终止, 未获取Cookie ‼️');
  }
})().catch(e => {
  $nobyda.notify("京东签到", "", e.message || JSON.stringify(e));
}).finally(() => {
  $nobyda.done();
});

// ===== 业务函数 =====

function buildApiOptions(cookie, functionId, body, appid) {
  const ts = String(Date.now());
  const uuid = genUuid();
  const params = [
    `functionId=${functionId}`,
    `appid=${appid || 'ld'}`,
    `client=android`,
    `clientVersion=11.0.0`,
    `networkType=wifi`,
    `osVersion=31`,
    `uuid=${uuid}`,
    `timestamp=${ts}`
  ].join('&');
  return {
    url: `https://api.m.jd.com/client.action?${params}`,
    headers: {
      'Cookie': cookie,
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Accept': '*/*',
      'Referer': 'https://h5.m.jd.com/',
      'Origin': 'https://h5.m.jd.com'
    },
    body: `body=${encodeURIComponent(JSON.stringify(body))}&build=167728`
  };
}

function JingDongBean(s) {
  merge.JDBean = {};
  return new Promise(resolve => {
    if (disable("JDBean")) return resolve();
    setTimeout(() => {
      const opt1 = buildApiOptions(KEY, 'signBeanIndex', { flag: "cp_sign", version: 2, channel: "签到领京豆" });
      $nobyda.post(opt1, function(error, response, data) {
        try {
          if (error) throw new Error(error);
          const opt2 = buildApiOptions(KEY, 'signBeanAct', { flag: "cp_sign", version: 2, channel: "签到领京豆" });
          $nobyda.post(opt2, function(error2, response2, data2) {
            try {
              if (error2) throw new Error(error2);
              const cc = JSON.parse(data2 || '{}');
              const Details = LogDetails ? "response:\n" + data2 : '';
              if (cc.success || cc.code == 0) {
                const d = cc.data || {};
                const num = d.beanNum || d.message || "已签到";
                if (typeof num === 'number') merge.JDBean.bean = num;
                merge.JDBean.notify = `京东商城-京豆: 成功, 明细: ${num} 🐶`;
                merge.JDBean.success = 1;
                console.log("\n京东商城-京豆签到成功 " + Details);
              } else {
                merge.JDBean.fail = 1;
                const msg = cc.errorMessage || cc.message || cc.echo || '未知';
                if (/已签到|已领取/.test(data2)) {
                  merge.JDBean.notify = "京东商城-京豆: 失败, 原因: 已签过 ⚠️";
                } else {
                  merge.JDBean.notify = `京东商城-京豆: 失败, 原因: ${msg} ⚠️`;
                }
                console.log("\n京东商城-京豆签到失败 " + Details);
              }
            } catch (eor) {
              $nobyda.AnError("京东商城-京豆", "JDBean", eor, response2, data2);
            } finally {
              resolve();
            }
          });
        } catch (eor) {
          $nobyda.AnError("京东商城-京豆", "JDBean", eor, response, data);
          resolve();
        }
      });
    }, s);
    if (out) setTimeout(resolve, out + s + 2000);
  });
}

function isThrottled(res) {
  const ec = String(res.errorCode || "");
  const msg = String(res.errorMessage || "");
  return ["VH304", "TI120"].indexOf(ec) !== -1 || msg.indexOf("火爆") !== -1 || msg.indexOf("人数较多") !== -1;
}

function BeanHomeTask(s) {
  merge.BeanHome = {};
  return new Promise(resolve => {
    if (disable("BeanHome")) return resolve();
    setTimeout(() => {
      const opt1 = buildApiOptions(KEY, 'beanHomeIconDoTask', { flag: "0", viewChannel: "myjd" });
      $nobyda.post(opt1, function(error, response, data) {
        try {
          if (error) throw new Error(error);
          const waitMs = 2000 + Math.floor(Math.random() * 2000);
          setTimeout(() => {
            const opt2 = buildApiOptions(KEY, 'beanHomeIconDoTask', { flag: "1", viewChannel: "AppHome" });
            $nobyda.post(opt2, function(error2, response2, data2) {
              try {
                if (error2) throw new Error(error2);
                const cc = JSON.parse(data2 || '{}');
                if (isThrottled(cc)) {
                  merge.BeanHome.fail = 1;
                  merge.BeanHome.notify = "京东商城-逛首页: 失败, 被限流 ⚠️";
                } else if (cc.code == 0 && !cc.errorCode) {
                  merge.BeanHome.success = 1;
                  merge.BeanHome.bean = (cc.data && (cc.data.beanNum || cc.data.reward)) || 0;
                  merge.BeanHome.notify = `京东商城-逛首页: 成功, 明细: ${merge.BeanHome.bean || '无'}京豆 🐶`;
                } else {
                  merge.BeanHome.fail = 1;
                  merge.BeanHome.notify = `京东商城-逛首页: 失败, 原因: ${cc.errorMessage || cc.echo || '未知'} ⚠️`;
                }
              } catch (eor) {
                $nobyda.AnError("京东商城-逛首页", "BeanHome", eor, response2, data2);
              } finally {
                resolve();
              }
            });
          }, waitMs);
        } catch (eor) {
          $nobyda.AnError("京东商城-逛首页", "BeanHome", eor, response, data);
          resolve();
        }
      });
    }, s);
    if (out) setTimeout(resolve, out + s + 5000);
  });
}

function BeanTasks(s) {
  merge.BeanTasks = {};
  return new Promise(resolve => {
    if (disable("BeanTasks")) return resolve();
    setTimeout(async () => {
      try {
        const log = [];
        let done = 0, throttled = 0;
        const optList = buildApiOptions(KEY, 'beanTaskList', { viewChannel: "AppHome", beanVersion: 1 });
        $nobyda.post(optList, async function(error, response, data) {
          try {
            if (error) throw new Error(error);
            const res = JSON.parse(data || '{}');
            if (res.error) {
              merge.BeanTasks.fail = 1;
              merge.BeanTasks.notify = `京东商城-赚豆: 任务列表失败 ${res.error} ⚠️`;
              return resolve();
            }
            const tasks = (res.data || {}).taskInfos || [];
            if (!tasks.length) {
              merge.BeanTasks.notify = "京东商城-赚豆: 无任务";
              return resolve();
            }
            const MAX_SUBTASKS = 10;
            for (const t of tasks) {
              if (done >= MAX_SUBTASKS) break;
              const tName = t.taskName || '?';
              const tType = t.taskType;
              if ((t.times || 0) >= (t.maxTimes || 1)) continue;
              const subs = t.subTaskVOS || [];
              for (const sub of subs) {
                if (done >= MAX_SUBTASKS) break;
                if (sub.status != 1) continue;
                const token = sub.taskToken || '';
                if (!token) continue;
                const r1 = await doApi('beanDoTask', { actionType: 1, taskToken: token });
                if (isThrottled(r1)) {
                  throttled++;
                  await sleep(3000 + Math.random() * 3000);
                  continue;
                }
                if (tType === 8 || tType === 9) {
                  const wait = Math.min(t.waitDuration || 5, 15);
                  await sleep(wait * 1000 + Math.random() * 2000);
                  const r0 = await doApi('beanDoTask', { actionType: 0, taskToken: token });
                  if (isThrottled(r0)) {
                    throttled++;
                  } else if (r0.code == 0 && !r0.errorCode) {
                    done++;
                    log.push(`${tName}:OK`);
                  } else {
                    log.push(`${tName}:${r0.errorMessage || r0.echo || '-'}`);
                  }
                } else {
                  if (r1.code == 0 && !r1.errorCode) {
                    done++;
                    log.push(`${tName}:OK`);
                  } else {
                    log.push(`${tName}:${r1.errorMessage || r1.echo || '-'}`);
                  }
                }
                await sleep(3000 + Math.random() * 5000);
                break;
              }
            }
            log.push(`完成:${done}个` + (throttled ? `(限流:${throttled}次)` : ""));
            merge.BeanTasks.success = done > 0 ? 1 : 0;
            merge.BeanTasks.fail = done === 0 ? 1 : 0;
            merge.BeanTasks.notify = `京东商城-赚豆: ${log.join(' | ')}`;
          } catch (eor) {
            $nobyda.AnError("京东商城-赚豆", "BeanTasks", eor, response, data);
          } finally {
            resolve();
          }
        });
      } catch (eor) {
        $nobyda.AnError("京东商城-赚豆", "BeanTasks", eor, null, null);
        resolve();
      }
    }, s);
    if (out) setTimeout(resolve, out + s + 60000);
  });
}

function doApi(functionId, body) {
  return new Promise(resolve => {
    const opt = buildApiOptions(KEY, functionId, body);
    $nobyda.post(opt, function(error, response, data) {
      if (error) return resolve({ error: error });
      try {
        return resolve(JSON.parse(data || '{}'));
      } catch (e) {
        return resolve({ error: e.message });
      }
    });
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function TotalBean() {
  merge.TotalBean = {};
  return new Promise(resolve => {
    if (disable("Qbear")) return resolve();
    $nobyda.get({
      url: 'https://me-api.jd.com/user_new/info/GetJDUserInfoUnion',
      headers: { Cookie: KEY }
    }, (error, response, data) => {
      try {
        if (error) throw new Error(error);
        const cc = JSON.parse(data);
        if (cc.msg == 'success' && cc.retcode == 0) {
          merge.TotalBean.nickname = cc.data.userInfo.baseInfo.nickname || "";
          merge.TotalBean.Qbear = cc.data.assetInfo.beanNum || 0;
          $nobyda.headUrl = cc.data.userInfo.baseInfo.headImageUrl || "";
        } else {
          const name = decodeURIComponent((KEY.split(/pt_pin=(.+?);/)[1] || ''));
          merge.TotalBean.nickname = cc.retcode == 1001 ? `${name} (CK失效‼️)` : "";
        }
      } catch (eor) {
        $nobyda.AnError("账户京豆-查询", "TotalBean", eor, response, data);
      } finally {
        resolve();
      }
    });
    if (out) setTimeout(resolve, out);
  });
}

// ===== 工具函数 =====

function disable(Val, name, way) {
  const read = $nobyda.read("JD_DailyBonusDisables");
  const annal = $nobyda.read("JD_Crash_" + Val);
  if (annal && way == 1 && boxdis) {
    var Crash = $nobyda.write("", "JD_Crash_" + Val);
    if (read) {
      if (read.indexOf(Val) == -1) {
        Crash = $nobyda.write(`${read},${Val}`, "JD_DailyBonusDisables");
        console.log(`\n${name}-触发自动禁用 ‼️`);
        merge[Val].notify = `${name}: 崩溃, 触发自动禁用 ‼️`;
        merge[Val].error = 1;
        $nobyda.disable = 1;
      }
    } else {
      Crash = $nobyda.write(Val, "JD_DailyBonusDisables");
      console.log(`\n${name}-触发自动禁用 ‼️`);
      merge[Val].notify = `${name}: 崩溃, 触发自动禁用 ‼️`;
      merge[Val].error = 1;
      $nobyda.disable = 1;
    }
    return true;
  } else if (way == 1 && boxdis) {
    var Crash = $nobyda.write(name, "JD_Crash_" + Val);
  } else if (way == 2 && annal) {
    var Crash = $nobyda.write("", "JD_Crash_" + Val);
  }
  if (read && read.indexOf(Val) != -1) return true;
  return false;
}

function Wait(readDelay, ini) {
  if (!readDelay || readDelay === '0') return 0;
  if (typeof (readDelay) == 'string') {
    readDelay = readDelay.replace(/"|＂|'|＇/g, '');
    if (readDelay.indexOf('-') == -1) return parseInt(readDelay) || 0;
    const raw = readDelay.split("-").map(Number);
    const plan = parseInt(Math.random() * (raw[1] - raw[0] + 1) + raw[0], 10);
    if (ini) console.log(`\n初始化随机延迟: 最小${raw[0] / 1000}秒, 最大${raw[1] / 1000}秒`);
    return ini ? readDelay : plan;
  } else if (typeof (readDelay) == 'number') {
    return readDelay > 0 ? readDelay : 0;
  }
  return 0;
}

function genUuid() {
  const chars = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 16; i++) s += chars[Math.floor(Math.random() * 16)];
  return s;
}

function checkFormat(value) {
  let n, k, c = {};
  return value.reduce((t, i) => {
    k = ((i.cookie || '').match(/(pt_key|pt_pin)=.+?;/g) || []).sort();
    if (k.length == 2) {
      if ((n = k[1]) && !c[n]) {
        i.userName = i.userName ? i.userName : decodeURIComponent(n.split(/pt_pin=(.+?);/)[1]);
        i.cookie = k.join('');
        c[n] = t.push(i);
      }
    }
    return t;
  }, []);
}

function CookieUpdate(oldValue, newValue, path = 'cookie') {
  let item, type, name = (oldValue || newValue || '').split(/pt_pin=(.+?);/)[1];
  let total = $nobyda.read('CookiesJD');
  try {
    total = checkFormat(JSON.parse(total || '[]'));
  } catch (e) {
    total = [];
  }
  for (let i = 0; i < total.length; i++) {
    if (total[i].cookie && new RegExp(`pt_pin=${name};`).test(total[i].cookie)) {
      item = i;
      break;
    }
  }
  if (newValue && item !== undefined) {
    type = total[item][path] === newValue ? -1 : 2;
    total[item][path] = newValue;
    item = item + 1;
  } else if (newValue && path === 'cookie') {
    total.push({ cookie: newValue });
    type = 1;
    item = total.length;
  }
  return {
    total: checkFormat(total),
    type,
    item,
    name: decodeURIComponent(name)
  };
}

function GetCookie() {
  const req = $request;
  if (req.method != 'OPTIONS' && req.headers) {
    const CV = (req.headers['Cookie'] || req.headers['cookie'] || '');
    const ckItems = CV.match(/(pt_key|pt_pin)=.+?;/g);
    if (/^https:\/\/(me-|)api(\.m|)\.jd\.com\/(client\.|user_new)/.test(req.url)) {
      if (ckItems && ckItems.length == 2) {
        const value = CookieUpdate(null, ckItems.join(''));
        if (value.type !== -1) {
          const write = $nobyda.write(JSON.stringify(value.total, null, 2), "CookiesJD");
          $nobyda.notify(`用户名: ${value.name}`, ``, `${value.type == 2 ? `更新` : `写入`}京东 [账号${value.item}] Cookie${write ? `成功 🎉` : `失败 ‼️`}`);
        }
      } else {
        throw new Error("写入Cookie失败, 关键值缺失\n可能原因: 非网页获取 ‼️");
      }
    } else if (req.url === 'http://www.apple.com/') {
      throw new Error("类型错误, 手动运行请选择上下文环境为Cron ⚠️");
    }
  } else if (!req.headers) {
    throw new Error("写入Cookie失败, 请检查匹配URL或配置内脚本类型 ⚠️");
  }
}

// ===== 适配层 =====
function nobyda() {
  const start = Date.now();
  const isRequest = typeof $request != "undefined";
  const isSurge = typeof $httpClient != "undefined";
  const isQuanX = typeof $task != "undefined";
  const isLoon = typeof $loon != "undefined";
  const isJSBox = typeof $app != "undefined" && typeof $http != "undefined";
  const isNode = typeof require == "function" && !isJSBox;
  const NodeSet = 'CookieSet.json';
  const node = (() => {
    if (isNode) {
      const fs = require("fs");
      const path = require("path");
      let axios = null;
      try { axios = require('axios'); } catch (e) {}
      return { axios, fs, path };
    }
    return null;
  })();

  const notify = (title, subtitle, message, rawopts) => {
    console.log(`${title}\n${subtitle}\n${message}`);
    if (isQuanX) $notify(title, subtitle, message, rawopts);
    if (isSurge) $notification.post(title, subtitle, message, rawopts);
    if (isJSBox) $push.schedule({ title: title, body: subtitle ? subtitle + "\n" + message : message });
  };

  const write = (value, key) => {
    if (isQuanX) return $prefs.setValueForKey(value, key);
    if (isSurge) return $persistentStore.write(value, key);
    if (isNode) {
      try {
        const p = node.path.resolve(__dirname, NodeSet);
        if (!node.fs.existsSync(p)) node.fs.writeFileSync(p, JSON.stringify({}));
        const dataValue = JSON.parse(node.fs.readFileSync(p));
        if (value) dataValue[key] = value;
        if (!value) delete dataValue[key];
        return node.fs.writeFileSync(p, JSON.stringify(dataValue));
      } catch (er) {
        return AnError('Node.js持久化写入', null, er);
      }
    }
    if (isJSBox) {
      if (!value) return $file.delete(`shared://${key}.txt`);
      return $file.write({ data: $data({ string: value }), path: `shared://${key}.txt` });
    }
  };

  const read = (key) => {
    if (isQuanX) return $prefs.valueForKey(key);
    if (isSurge) return $persistentStore.read(key);
    if (isNode) {
      try {
        const p = node.path.resolve(__dirname, NodeSet);
        if (!node.fs.existsSync(p)) return null;
        const dataValue = JSON.parse(node.fs.readFileSync(p));
        return dataValue[key];
      } catch (er) {
        return AnError('Node.js持久化读取', null, er);
      }
    }
    if (isJSBox) {
      if (!$file.exists(`shared://${key}.txt`)) return null;
      return $file.read(`shared://${key}.txt`).string;
    }
  };

  const adapterStatus = (response) => {
    if (response) {
      if (response.status) response["statusCode"] = response.status;
      else if (response.statusCode) response["status"] = response.statusCode;
    }
    return response;
  };

  const get = (options, callback) => {
    options.headers['User-Agent'] = UA;
    if (isQuanX) {
      if (typeof options == "string") options = { url: options };
      options["method"] = "GET";
      $task.fetch(options).then(response => {
        callback(null, adapterStatus(response), response.body);
      }, reason => callback(reason.error, null, null));
    }
    if (isSurge) {
      options.headers['X-Surge-Skip-Scripting'] = false;
      $httpClient.get(options, (error, response, body) => {
        callback(error, adapterStatus(response), body);
      });
    }
    if (isNode) {
      if (node.axios) {
        node.axios.get(options.url, { headers: options.headers, timeout: 20000 })
          .then(r => callback(null, adapterStatus(r), typeof r.data === 'string' ? r.data : JSON.stringify(r.data)))
          .catch(e => callback(e.message, null, null));
      } else {
        callback('Node 环境缺少 axios 模块，请执行 npm install axios', null, null);
      }
    }
    if (isJSBox) {
      if (typeof options == "string") options = { url: options };
      options["header"] = options["headers"];
      options["handler"] = function (resp) {
        let error = resp.error;
        if (error) error = JSON.stringify(resp.error);
        let body = resp.data;
        if (typeof body == "object") body = JSON.stringify(resp.data);
        callback(error, adapterStatus(resp.response), body);
      };
      $http.get(options);
    }
  };

  const post = (options, callback) => {
    options.headers['User-Agent'] = UA;
    if (options.body) options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    if (isQuanX) {
      if (typeof options == "string") options = { url: options };
      options["method"] = "POST";
      $task.fetch(options).then(response => {
        callback(null, adapterStatus(response), response.body);
      }, reason => callback(reason.error, null, null));
    }
    if (isSurge) {
      options.headers['X-Surge-Skip-Scripting'] = false;
      $httpClient.post(options, (error, response, body) => {
        callback(error, adapterStatus(response), body);
      });
    }
    if (isNode) {
      if (node.axios) {
        node.axios.post(options.url, options.body || '', { headers: options.headers, timeout: 20000 })
          .then(r => callback(null, adapterStatus(r), typeof r.data === 'string' ? r.data : JSON.stringify(r.data)))
          .catch(e => callback(e.message, null, null));
      } else {
        callback('Node 环境缺少 axios 模块，请执行 npm install axios', null, null);
      }
    }
    if (isJSBox) {
      if (typeof options == "string") options = { url: options };
      options["header"] = options["headers"];
      options["handler"] = function (resp) {
        let error = resp.error;
        if (error) error = JSON.stringify(resp.error);
        let body = resp.data;
        if (typeof body == "object") body = JSON.stringify(resp.data);
        callback(error, adapterStatus(resp.response), body);
      };
      $http.post(options);
    }
  };

  const AnError = (name, keyname, er, resp, body) => {
    if (typeof (merge) != "undefined" && keyname) {
      if (!merge[keyname].notify) merge[keyname].notify = `${name}: 异常, 已输出日志 ‼️`;
      else merge[keyname].notify += `\n${name}: 异常, 已输出日志 ‼️ (2)`;
      merge[keyname].error = 1;
    }
    return console.log(`\n‼️${name}发生错误\n‼️名称: ${er.name}\n‼️描述: ${er.message}${resp && resp.status ? `\n‼️状态: ${resp.status}` : ``}${body ? `\n‼️响应: ${resp && resp.status != 503 ? body : `Omit.`}` : ``}`);
  };

  const time = () => {
    const end = ((Date.now() - start) / 1000).toFixed(2);
    return console.log('\n签到用时: ' + end + ' 秒');
  };

  const done = (value = {}) => {
    if (isQuanX) return $done(value);
    if (isSurge) isRequest ? $done(value) : $done();
  };

  return { AnError, isRequest, isJSBox, isSurge, isQuanX, isLoon, isNode, notify, write, read, get, post, time, done };
}
