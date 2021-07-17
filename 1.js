const key = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCwOWCnV0hENyqTAsgG5j2WOEU+
qZq2CKMlNM12ERVw4o0mKMGMf3izXmZD69BbiYYbyFeJ2/9vfsDO/r2FolsJBsA7
4i/B2yU5oMO8UqpUMYxgW0vZcGb7aLcNgm64DwY+t1zI7tuj/6iVmulTsDxjK/ke
Vd+w9VAHni1FypzNDQIDAQAB
-----END PUBLIC KEY-----
`
const hash = '07c6501690c1af85'
const password = '1231231234567'
const crypto = require('crypto');

let encryptedPwd = crypto.publicEncrypt(key, Buffer.from(
        hash + password
    )).toString('base64')

console.log(encryptedPwd)
