// The hosted Windows sandbox occasionally exposes uv_os_get_passwd as ENOMEM.
// tsx only needs a stable username to choose its temporary cache directory.
const os = require('node:os');
try {
  os.userInfo();
} catch {
  os.userInfo = () => ({
    username: process.env.USERNAME || 'codex',
    uid: -1,
    gid: -1,
    shell: null,
    homedir: process.env.USERPROFILE || process.cwd(),
  });
}
