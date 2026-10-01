const H = {
  Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'dsh',
};

const REPO = 'MoslikeSsS/kozyr1';

(async () => {
  const refs = await (
    await fetch(`https://api.github.com/repos/${REPO}/git/matching-refs/heads`, { headers: H })
  ).json();
  console.log('ВЕТКИ:');
  if (Array.isArray(refs) && refs.length) {
    for (const r of refs) console.log(`  ${r.ref} = ${r.object.sha.slice(0, 10)}`);
  } else {
    console.log('  (пусто или ошибка)', JSON.stringify(refs).slice(0, 200));
  }

  const pages = await (
    await fetch(`https://api.github.com/repos/${REPO}/pages`, { headers: H })
  ).json();
  console.log('\nPAGES:', pages.status || '-', '| источник:', pages.source ? JSON.stringify(pages.source) : '-');
  console.log('адрес:', pages.html_url || '-');

  const actions = await (
    await fetch(`https://api.github.com/repos/${REPO}/actions/permissions`, { headers: H })
  ).json();
  console.log('\nACTIONS:', JSON.stringify(actions).slice(0, 200));
})();