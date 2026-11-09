import type { NewGithubUser } from "@github-user-project/db";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import { getConfig } from "./config";

// GitHub API 返回的用户对象（只列我们用到的字段）
type GithubApiUser = {
	id: number;
	login: string;
	name: string | null;
	avatar_url: string;
	html_url: string;
	bio: string | null;
	company: string | null;
	location: string | null;
	blog: string | null;
	public_repos: number;
	followers: number;
	following: number;
	created_at: string;
};

type GithubSearchResult = {
	items: Pick<GithubApiUser, "id" | "login" | "avatar_url" | "html_url">[];
};

export class GithubError extends Error {
	constructor(
		public status: ContentfulStatusCode,
		message: string,
	) {
		super(message);
	}
}

async function githubFetch<T>(path: string): Promise<T> {
	const { GITHUB_API_URL, GITHUB_TOKEN } = getConfig();
	const res = await fetch(`${GITHUB_API_URL}${path}`, {
		headers: {
			Accept: "application/vnd.github+json",
			"User-Agent": "github-user-project",
			"X-GitHub-Api-Version": "2022-11-28",
			...(GITHUB_TOKEN ? { Authorization: `Bearer ${GITHUB_TOKEN}` } : {}),
		},
		signal: AbortSignal.timeout(8000),
	});

	if (res.status === 404) throw new GithubError(404, "GitHub 上找不到这个用户");
	if (res.status === 403 || res.status === 429) {
		throw new GithubError(
			429,
			"GitHub API 调用太频繁，请稍后再试（或配置 GITHUB_TOKEN）",
		);
	}
	if (!res.ok) throw new GithubError(502, `GitHub API 出错：${res.status}`);

	return (await res.json()) as T;
}

// 把 GitHub 的下划线字段转换成我们表里的驼峰字段
function toRow(u: GithubApiUser): NewGithubUser {
	return {
		githubId: u.id,
		login: u.login,
		name: u.name,
		avatarUrl: u.avatar_url,
		htmlUrl: u.html_url,
		bio: u.bio,
		company: u.company,
		location: u.location,
		blog: u.blog || null,
		publicRepos: u.public_repos,
		followers: u.followers,
		following: u.following,
		githubCreatedAt: new Date(u.created_at),
	};
}

// 模糊搜索：输入关键字，返回最多 10 个候选用户
export async function searchGithubUsers(keyword: string) {
	const data = await githubFetch<GithubSearchResult>(
		`/search/users?q=${encodeURIComponent(keyword)}&per_page=10`,
	);
	return data.items.map((i) => ({
		githubId: i.id,
		login: i.login,
		avatarUrl: i.avatar_url,
		htmlUrl: i.html_url,
	}));
}

// 按用户名查完整资料
export async function getGithubProfile(login: string) {
	return toRow(
		await githubFetch<GithubApiUser>(`/users/${encodeURIComponent(login)}`),
	);
}

// 按 GitHub ID 查完整资料（用户改了名也能查到）
export async function getGithubProfileById(githubId: number) {
	return toRow(await githubFetch<GithubApiUser>(`/user/${githubId}`));
}
