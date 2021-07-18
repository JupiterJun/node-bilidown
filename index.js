// 常量和依赖库
const _ = require('inquirer');
const axios = require('axios');
const fs = require('fs');
const crypto = require('crypto');
const qs = require('qs');
const os = require('os');
const util = require('util');
const cp = require('child_process');
const path = require('path');
const { v1: uuidv1 } = require('uuid');
// const ffmpeg = require('fluent-ffmpeg');
const print = console.log;
const $ = axios.create({
    baseURL: 'https://api.bilibili.com/x/',
    timeout: 0,
    headers: {
        'cookie': obj2cookie(require('./cookie.json').awameow)
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
const ua = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36`;

// 主体部分
(async () => {
    // print('\n步骤一：Cookie登录\n');
    // let captchaResult = await cookie();
    // print('\n步骤二：密码登录\n');
    downVideo('BV1Sy4y1n7c4');
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
    var video = await videoInfo(bvid);
    let cids = [], fileName = {}, savedPaths = [];
    if (video.videos.length == 1) {
        cids.push(video.videos[0].cid);
        fileName[video.videos[0].cid] = `${video.bvid}-${video.title}`;
    }
    else {
        let pageChoices = []
        for (let i of video.videos) pageChoices.push({
            name: `P${i.page}${i.title}`,
            checked: (i.page == 1)
        });
        let res = (await _.prompt([{
            type: 'checkbox',
            message: '选择分集: ',
            name: 'page',
            choices: pageChoices
        }]
        )).page
        for (let i of res) {
            let cid = video.videos[res.indexOf(i)].cid
            cids.push(cid);
            fileName[cid] = `${video.bvid}-${video.title}-${i}`
        }
    }
    for (let i of cids) {
        print(i);
        let urls = await getVideoUrl(bvid, i);
        let paths = await saveVideo(urls);
        let savePath = mixAudioVideo(`[node-bilidown]_${fileName[i]}`, paths)
        // savedPaths.push(savePath);
    };
    return savedPaths;
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
        for (let i of res.data.support_formats) {
            if (res.data.dash.video
                .filter(a => a.id == i.quality).length == 0) continue;
            videoUrls[i.quality] = ({
                quaDesc: i.new_description,
                fps: i.farmeRate,
                h264: {
                    url: res.data.dash.video
                        .filter(a => a.id == i.quality)[0].baseUrl,
                    urlBackup: res.data.dash.video
                        .filter(a => a.id == i.quality)[0].backupUrl
                },
                h265: {
                    url: res.data.dash.video
                        .filter(a => a.id == i.quality)[1].baseUrl,
                    urlBackup: res.data.dash.video
                        .filter(a => a.id == i.quality)[1].backupUrl
                }
            })
        }
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
        let writer = fs.createWriteStream(
            path.resolve(savePath, `${fileName}.m4a`))
        let res = await $.get(videoUrls.audio['30280'].url, {
            headers: {
                'referer': 'https://www.bilibili.com',
                'User-Agent': ua
            },
            responseType: 'stream',
        })
        res.data.pipe(writer)
        writer.once[util.promisify.custom] = (foo) => {
            return new Promise((resolve, reject) => {
                writer.once(foo, resolve);
            });
        };
        let a = util.promisify(writer.once);
        await a('finish')
    } catch (error) {
        throw new Error(error)
    }
    try {
        let writer = fs.createWriteStream(
            path.resolve(savePath, `${fileName}.m4v`))
        let res = await $.get(videoUrls.video['80'].h264.url, {
            headers: {
                'referer': 'https://www.bilibili.com',
                'User-Agent': ua
            },
            responseType: "stream",
        })
        res.data.pipe(writer);
        writer.once[util.promisify.custom] = (foo) => {
            return new Promise((resolve, reject) => {
                writer.once(foo, resolve);
            });
        };
        let b = util.promisify(writer.once);
        await b('finish')
    } catch (error) {
        throw new Error(error)
    }
    return {
        video: path.resolve(savePath, `${fileName}.m4v`),
        audio: path.resolve(savePath, `${fileName}.m4a`)
    }
}

// 音视频混流
async function mixAudioVideo(outName, inPaths) {
    var writer = path.resolve(`./data/${outName}.mp4`)
    try {
        // await new Promise((resolve, reject) => {
        //     ffmpeg()
        //         .input(inPaths.audio)
        //         .input(inPaths.video)
        //         .audioCodec('copy')
        //         .videoCodec('copy')
        //         .on('end', () => {
        //             print('转码完成');
        //             resolve();
        //         })
        //         .on('progress', (progress) => {
        //             print(`Processing: ${progress.percent}% done`);
        //         })
        //         .on('error', (err, stdout, stderr) => {
        //             print(`Cannot process video: ${err.message}`);
        //             reject(err);
        //         })
        //         .save(writer)
        // })
        let command = `${path.resolve('./ffmpeg.exe')} -i ${inPaths.video} -i ${inPaths.audio} -codec copy -y ${writer}`
        cp.execSync(command);
    } catch (error) {
        throw new Error(error)
    }
    return writer
}

// 过滤文件名非法字符
function invalidCharFliter(char) {
    
}
