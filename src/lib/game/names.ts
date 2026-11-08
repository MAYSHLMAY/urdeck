const A = ['Swift', 'Brave', 'Clever', 'Sunny', 'Lucky', 'Cosmic', 'Mighty', 'Quiet', 'Wild', 'Jolly', 'Fuzzy', 'Rapid', 'Silver', 'Golden', 'Nimble', 'Bold', 'Chill', 'Epic', 'Happy', 'Sharp'];
const B = ['Falcon', 'Panda', 'Comet', 'Tiger', 'Otter', 'Rocket', 'Eagle', 'Fox', 'Wolf', 'Koala', 'Dragon', 'Pilot', 'Wing', 'Cloud', 'Lion', 'Owl', 'Hawk', 'Jet', 'Whale', 'Robin'];
export const randomName = () => A[Math.floor(Math.random() * A.length)] + B[Math.floor(Math.random() * B.length)] + (Math.random() < 0.5 ? '' : Math.floor(Math.random() * 90 + 10));
// a short list is enough to keep a classroom clean; the host can also kick anyone
const BAD = ['fuck', 'shit', 'bitch', 'asshole', 'dick', 'cunt', 'nigg', 'fag', 'slut', 'whore', 'porn', 'sex', 'rape', 'nazi'];
export const cleanName = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 20);
export const badName = (s: string) => { const t = s.toLowerCase().replace(/[^a-z]/g, ''); return BAD.some(w => t.includes(w)); };
