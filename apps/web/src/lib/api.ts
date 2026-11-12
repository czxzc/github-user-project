// 后端地址：本地是 http://localhost:3000，上线后换成 API Gateway 的地址
const BASE_URL = process.env.NEXT_PUBLIC_SERVER_URL;

// 数据库里的一条记录（经过 JSON 传输后，日期都变成了字符串）
export type GithubUser = {
	id: number;
	githubId: number;
	login: string;
	name: string | null;
	avatarUrl: string;
	htmlUrl: string;
	bio: string | null;
	company: string | null;
	location: string | null;
	blog: string | null;
	publicRepos: number;
	followers: number;
	following: number;
	note: string | null;
	githubCreatedAt: string | null;
	createdAt: string;
	updatedAt: string;
};

// 搜索结果里的一项
export type SearchItem = Pick<
	GithubUser,
	"githubId" | "login" | "avatarUrl" | "htmlUrl"
>;

// 预览资料：还没入库，所以没有 id/note；savedId 表示是否已经添加过
export type GithubProfile = Omit<
	GithubUser,
	"id" | "note" | "createdAt" | "updatedAt"
> & {
	savedId: number | null;
};

// 所有请求都走这里：拼地址、带请求头、统一把错误变成 Error
async function request<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(`${BASE_URL}${path}`, {
		...init,
		headers: init?.body ? { "Content-Type": "application/json" } : undefined,
	});
	if (res.status === 204) return undefined as T;
	const data = await res.json().catch(() => null);
	if (!res.ok) throw new Error(data?.error ?? `请求失败：${res.status}`);
	return data as T;
}

export const api = {
	searchGithub: (q: string) =>
		request<SearchItem[]>(`/api/github/search?q=${encodeURIComponent(q)}`),
	getGithubProfile: (login: string) =>
		request<GithubProfile>(`/api/github/users/${encodeURIComponent(login)}`),
	listUsers: () => request<GithubUser[]>("/api/users"),
	addUser: (login: string) =>
		request<GithubUser>("/api/users", {
			method: "POST",
			body: JSON.stringify({ login }),
		}),
	updateNote: (id: number, note: string | null) =>
		request<GithubUser>(`/api/users/${id}`, {
			method: "PATCH",
			body: JSON.stringify({ note }),
		}),
	refreshUser: (id: number) =>
		request<GithubUser>(`/api/users/${id}/refresh`, { method: "POST" }),
	deleteUser: (id: number) =>
		request<void>(`/api/users/${id}`, { method: "DELETE" }),
};

// 把 catch 到的任意错误转成一句话
export const errorMessage = (err: unknown) =>
	err instanceof Error ? err.message : "发生未知错误";
