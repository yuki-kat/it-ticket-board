/**
 * Knowledge base articles. Like tickets they live in this browser (and go into Settings → Backup), so the page
 * works without a server; only the AI actions (draft from a ticket, ask the KB) need the hosted site.
 */
export type ArticleStatus = 'Draft' | 'Published'
export type KbArticle = {
  id: string
  title: string
  summary: string
  symptoms: string
  cause: string
  steps: string[]
  tags: string[]
  status: ArticleStatus
  author: string
  createdAt: string
  updatedAt: string
  sourceTicketId?: string
  /** Set when the text came from AI, until someone edits and publishes it. */
  aiDraft?: { provider: string; model: string; at: string }
}

export const KB_STORAGE_KEY = 'it-ticket-kanban-kb-v1'

export const nextArticleId = (articles: KbArticle[]) => {
  const highest = articles.reduce((max, article) => Math.max(max, Number(article.id.replace(/\D/g, '')) || 0), 0)
  return `KB-${String(highest + 1).padStart(4, '0')}`
}

export const articleBody = (article: KbArticle) => [
  article.summary,
  article.symptoms && `Symptoms: ${article.symptoms}`,
  article.cause && `Cause: ${article.cause}`,
  article.steps.length ? `Steps:\n${article.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}` : '',
].filter(Boolean).join('\n')

export const articleText = (article: KbArticle) => `${article.id} · ${article.title}\n\n${articleBody(article)}${article.tags.length ? `\n\nTags: ${article.tags.join(', ')}` : ''}`

// ---- Search -------------------------------------------------------------------------------------------------------

const STOP_WORDS = new Set('the and for are but not you all any can had her was one our out has his how its may new now see two way who did get got let put say she too use with that this from have what when where which will your into than then them they been were does doesnt cant wont after before about there their could would should just also only some more most very like need cannot unable working work works'.split(' '))

export const searchTerms = (text: string) => [...new Set(text.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/\s+/).filter((word) => word.length > 2 && !STOP_WORDS.has(word)))]

/** Simple keyword ranking: title words count most, then tags, then the rest of the article. */
export function rankArticles(articles: KbArticle[], query: string): Array<{ article: KbArticle; score: number }> {
  const terms = searchTerms(query)
  if (!terms.length) return []
  return articles.map((article) => {
    const title = article.title.toLowerCase()
    const tags = article.tags.join(' ').toLowerCase()
    const body = articleBody(article).toLowerCase()
    const score = terms.reduce((total, term) => total + (title.includes(term) ? 3 : 0) + (tags.includes(term) ? 2 : 0) + (body.includes(term) ? 1 : 0), 0)
    return { article, score }
  }).filter((hit) => hit.score > 0).sort((a, b) => b.score - a.score || a.article.id.localeCompare(b.article.id))
}

export const matchesFilter = (article: KbArticle, query: string) => {
  const terms = searchTerms(query)
  if (!terms.length) return true
  const text = `${article.id} ${article.title} ${article.tags.join(' ')} ${articleBody(article)}`.toLowerCase()
  return terms.every((term) => text.includes(term))
}

// ---- Storage ------------------------------------------------------------------------------------------------------

export function loadArticles(now = new Date()): KbArticle[] {
  try {
    const saved = JSON.parse(localStorage.getItem(KB_STORAGE_KEY) || 'null')
    if (Array.isArray(saved)) return saved as KbArticle[]
  } catch { /* fall back to the samples */ }
  return sampleArticles(now)
}

export function saveArticles(articles: KbArticle[]) {
  try { localStorage.setItem(KB_STORAGE_KEY, JSON.stringify(articles)) } catch { /* storage full or blocked: keep working in memory */ }
}

// ---- Sample articles ----------------------------------------------------------------------------------------------

export function sampleArticles(now = new Date()): KbArticle[] {
  const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString()
  const article = (id: string, days: number, fields: Omit<KbArticle, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'author'> & { status?: ArticleStatus; author?: string }): KbArticle => ({
    id, status: 'Published', author: 'Service Desk', createdAt: daysAgo(days), updatedAt: daysAgo(Math.max(0, days - 3)), ...fields,
  })
  return [
    article('KB-0001', 40, {
      title: 'VPN sign-in fails with "authentication failed" after a password change',
      summary: 'The VPN client keeps the old password and the account locks after repeated retries.',
      symptoms: 'Remote users cannot connect after changing their password. The client shows "authentication failed", then the account locks.',
      cause: 'The VPN client saved the previous password and retries it in the background.',
      steps: ['Unlock the account in the directory if it is locked.', 'Open the VPN client and clear the saved credentials.', 'Sign in again with the new password.', 'If MFA prompts do not arrive, re-register the user’s MFA method.'],
      tags: ['vpn', 'password', 'remote'],
    }),
    article('KB-0002', 33, {
      title: 'Clear a stuck print queue on a shared printer',
      summary: 'Restarting the print spooler clears jobs that block everyone else on the floor.',
      symptoms: 'Jobs stay in the queue as "Printing" or "Error" and nothing comes out. Other users’ jobs queue behind them.',
      cause: 'A corrupt or very large job holds the spooler on the print server.',
      steps: ['Open Services on the print server.', 'Stop the Print Spooler service.', 'Delete the files in C:\\Windows\\System32\\spool\\PRINTERS.', 'Start the Print Spooler service.', 'Ask the user to send a test page.'],
      tags: ['printing', 'spooler', 'windows'],
    }),
    article('KB-0003', 27, {
      title: 'Grant access to a shared drive folder',
      summary: 'Access is managed by security groups, not by permissions on the folder itself.',
      symptoms: 'User sees "access denied" when opening a department folder on the shared drive.',
      cause: 'The user is not in the folder’s security group, or was added after their last sign-in.',
      steps: ['Confirm the request with the folder owner.', 'Find the folder’s security group in the folder properties (Security tab).', 'Add the user to that group.', 'Ask the user to sign out and back in so the new group membership applies.'],
      tags: ['access', 'shared drive', 'permissions'],
    }),
    article('KB-0004', 21, {
      title: 'Laptop camera not detected in Teams or Zoom',
      summary: 'Usually a privacy setting or a disabled device, rarely hardware.',
      symptoms: 'Video apps show "no camera found" or a black preview.',
      cause: 'The camera privacy switch or the OS camera permission is off, or the device was disabled after an update.',
      steps: ['Check for a physical privacy shutter or a function key that turns the camera off.', 'Open Settings › Privacy › Camera and allow desktop apps to use the camera.', 'In Device Manager, enable the camera if it is disabled, then restart.', 'If it is still missing, raise a hardware repair.'],
      tags: ['camera', 'teams', 'zoom', 'hardware'],
    }),
    article('KB-0005', 12, {
      title: 'New starter cannot open email on day one',
      summary: 'Mailbox licences take time to apply after the account is created.',
      symptoms: 'Outlook keeps asking for a password or says the mailbox does not exist.',
      cause: 'The email licence was assigned less than an hour ago, or not at all.',
      steps: ['Check the user has an email licence assigned.', 'If it was just assigned, wait up to an hour for the mailbox to be created.', 'Sign in to webmail first to confirm the mailbox works.', 'Then set up Outlook on the laptop.'],
      tags: ['email', 'onboarding', 'licensing'],
    }),
    article('KB-0006', 2, {
      title: 'Repeated account lockouts from an old mobile device',
      summary: 'A phone or tablet with an old password keeps locking the account.',
      symptoms: 'The user is locked out several times a day even after resetting their password.',
      cause: 'A mobile mail app or Wi-Fi profile still uses the old password.',
      steps: ['Check the lockout source in the directory audit log.', 'Remove or update the mail account and Wi-Fi profile on the device it points to.', 'Unlock the account.'],
      tags: ['lockout', 'mobile', 'password'],
      status: 'Draft',
      author: 'Aiko Tanaka',
    }),
  ]
}
