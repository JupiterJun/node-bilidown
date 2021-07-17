// 常量和依赖库
const _ = require('inquirer');
const axios = require('axios');
const fs = require('fs');
const crypto = require('crypto');
const qs = require('qs');
const os = require('os');
const path = require('path');
const { v1: uuidv1 } = require('uuid');
const print = console.log;
const $ = axios.create({
    baseURL: 'https://api.bilibili.com/x/',
    timeout: 0,
    headers: {
        'cookie': obj2cookie(require('./cookie.json').jjun)
    },
    // proxy: {
    //     host: '127.0.0.1',
    //     port: 8888,
    // }
});
const auth = axios.create({
    baseURL: 'https://passport.bilibili.com/',
    timeout: 0,
});

// 主体部分
(async () => {
    // print('\n步骤一：Cookie登录\n');
    // let captchaResult = await cookie();
    // print('\n步骤二：密码登录\n');
    downVideo('BV1Zo4y1k7NA');
})();

// 人机验证
async function captcha() {
    let gt, challenge, key, validate, seccode
    try {
        let res = (await auth.get('web/captcha/combine?plat=6')).data;
        if (res.code != 0) throw new Error(res.data);
        ({ gt, challenge, key } = res.data.result);
    }
    catch (error) {
        throw new Error(error);
    }
    print('https://kuresaru.github.io/geetest-validator/ \n')
    print(`       gt: ${gt}`);
    print(`challenge: ${challenge}\n`);
    try {
        let res = await _.prompt([{
            type: 'input',
            message: 'validate:',
            name: 'validate'
        }, {
            type: 'input',
            message: ' seccode:',
            name: 'seccode'
        }]);
        ({ validate, seccode } = res)
        return {
            key: key,
            challenge: challenge,
            validate: validate,
            seccode: seccode
        }
    } catch (error) {
        throw new Error(error);
    }
}

// 用户名密码登录（死活测试不好）
async function login(captchaResult) {
    let hash, key, userName, password
    try {
        let res = await _.prompt([{
            type: 'input',
            message: '手机/邮箱:',
            name: 'userName'
        }, {
            type: 'password',
            message: '密码:',
            name: 'password'
        }]);
        ({ userName, password } = res)
    } catch (error) {
        throw new Error(error);
    }
    try {
        let res = (await auth.get('login?act=getkey')).data;
        ({ hash, key } = res);
    } catch (error) {
        throw new Error(error);
    }
    let encryptedPwd = crypto.publicEncrypt(key, Buffer.from(
        hash + password
    )).toString('base64')
    try {
        let res = await auth.post('web/login/v2', {
            data: qs.stringify({
                captchaType: 6, keep: true,
                username: userName,
                password: encryptedPwd,
                key: captchaResult.key,
                challenge: captchaResult.challenge,
                validate: captchaResult.validate,
                seccode: captchaResult.seccode
            })
        });
        if (res.data.code != 0) throw new Error(res.message);
        if (!res.data.data.isLogin) throw new Error('登录了，但没完全登录。');
        return res.headers['Set-Cookie']
    } catch (error) {
        throw new Error(error);
    }
}

// Cookie 登录
async function cookie() {

}

// 下载视频
async function downVideo(bvid) {
    let video = await videoInfo(bvid);
    let cids = []
    if (video.videos.length == 1) cids.push(video.videos[0].cid);
    else {
        let pageChoices = []
        for (let i of video.videos) pageChoices.push({
            name: `P${i.page}: ${i.title}`,
            checked: (i.page == 1)
        });
        let res = (await _.prompt([{
            type: 'checkbox',
            message: '选择分集: ',
            name: 'page',
            choices: pageChoices
        }]
        )).page
        for (let i of res) cids.push(
            video.videos[Number(i.substring(
                1, i.indexOf(':')
            )) - 1].cid
        )
    }
    let urls = [];
    for (let i of cids) urls.push(await getVideoUrl(bvid, i));
    for (let i of urls) await saveVideo(i);
    print(cids);
}

// Object 转 Header Cookie 格式
function obj2cookie(obj) {
    if (obj.constructor == Object) {
        var str = '';
        for (let i in obj) str = `${str}; ${i}=${obj[i]}`
        return str
    }
}

// 获取视频信息
async function videoInfo(bvid) {
    try {
        let res = (await $.get('web-interface/view', {
            params: {
                bvid: bvid
            }
        })).data
        if (res.code != 0) throw new Error(res.data);
        let videos = [];
        for (i of res.data.pages) videos.push({
            cid: i.cid,
            page: i.page,
            title: i.part
        })
        return {
            bvid: bvid,
            aid: res.data.aid,
            title: res.data.title,
            desc: res.data.desc_v2[0].raw_text,
            cover: res.data.pic,
            uploader: res.data.owner.mid,
            videos: videos
        }
    } catch (error) {
        throw new Error(error)
    }

}

//获取下载链接
async function getVideoUrl(bvid, cid) {
    try {
        let res = (await $.get('player/playurl', {
            params: {
                bvid: bvid,
                cid: cid,
                fnval: 16,
            }
        })).data
        if (res.code != 0) throw new Error(res.message);
        let audioUrls = {}, videoUrls = {};
        for (let i of res.data.dash.audio) audioUrls[i.id] = {
            url: i.baseUrl
        }
        for (let i of res.data.dash.video) videoUrls[i.id] = ({
            url: i.baseUrl,
            url_1: i.backupUrl[0],
            url_2: i.backupUrl[1],
            fps: i.farmeRate
        })
        return {
            audio: audioUrls,
            video: videoUrls
        }
    } catch (error) {
        throw new Error(error)
    }
}

// 下载保存视频
async function saveVideo(videoUrls) {
    let savePath = path.join(os.tmpdir(), 'node-bilidown')
    if (!fs.existsSync(savePath)) fs.mkdirSync(savePath);
    let fileName = uuidv1();
    try {
        let writer = fs.createWriteStream(path.resolve(savePath, `${fileName}.m4a`))
        let res = await $.get(videoUrls.audio['30280'].url, {
            headers: {
                'referer': 'https://www.bilibili.com',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36'
            },
            responseType: "stream",
        })
        res.data.pipe(writer)
    } catch (error) {
        throw new Error(error)
    }
    
    try {
        let writer = fs.createWriteStream(path.resolve(savePath, `${fileName}.m4v`))
        let res = await $.get(videoUrls.video['30280'].url, {
            headers: {
                'referer': 'https://www.bilibili.com',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36'
            },
            responseType: "stream",
        })
        res.data.pipe(writer)
    } catch (error) {
        throw new Error(error)
    }
}
