"use client";

import { Button } from "@github-user-project/ui/components/button";
import { Input } from "@github-user-project/ui/components/input";
import {
	Building2,
	Check,
	Loader2,
	MapPin,
	Search,
	UserPlus,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
	api,
	errorMessage,
	type GithubProfile,
	type GithubUser,
	type SearchItem,
} from "@/lib/api";

type Props = {
	savedGithubIds: Set<number>; // 已保存用户的 GitHub ID 集合，由父组件根据列表算出来
	onAdded: (user: GithubUser) => void;
};

export function GithubSearch({ savedGithubIds, onAdded }: Props) {
	const [keyword, setKeyword] = useState("");
	const [results, setResults] = useState<SearchItem[]>([]);
	const [profile, setProfile] = useState<GithubProfile | null>(null);
	const [searching, setSearching] = useState(false);
	const [adding, setAdding] = useState(false);

	// 第一步：按关键字搜索，得到候选列表
	async function handleSearch(e: React.FormEvent) {
		e.preventDefault(); // 阻止表单默认的整页刷新
		const q = keyword.trim();
		if (!q) return;
		setSearching(true);
		setProfile(null);
		try {
			const items = await api.searchGithub(q);
			setResults(items);
			if (items.length === 0) toast.info("没有找到匹配的用户");
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			setSearching(false);
		}
	}

	// 第二步：点选一个候选人，查看完整资料
	async function handleSelect(login: string) {
		try {
			setProfile(await api.getGithubProfile(login));
		} catch (err) {
			toast.error(errorMessage(err));
		}
	}

	// 第三步：加入数据库
	async function handleAdd() {
		if (!profile) return;
		setAdding(true);
		try {
			const user = await api.addUser(profile.login);
			onAdded(user);
			toast.success(`已添加 ${user.login}`);
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			setAdding(false);
		}
	}

	return (
		<section className="grid gap-4 rounded-lg border p-4">
			<h2 className="font-medium">搜索 GitHub 用户</h2>

			<form onSubmit={handleSearch} className="flex gap-2">
				<Input
					value={keyword}
					onChange={(e) => setKeyword(e.target.value)}
					placeholder="输入 GitHub 用户名，例如 octocat"
				/>
				<Button type="submit" disabled={searching}>
					{searching ? <Loader2 className="animate-spin" /> : <Search />}
					搜索
				</Button>
			</form>

			{results.length > 0 && (
				<ul className="flex flex-wrap gap-2">
					{results.map((item) => (
						<li key={item.githubId}>
							<button
								type="button"
								onClick={() => handleSelect(item.login)}
								className={`hover:bg-muted flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm ${
									profile?.githubId === item.githubId
										? "border-primary bg-muted"
										: ""
								}`}
							>
								<img
									src={item.avatarUrl}
									alt=""
									className="size-6 rounded-full"
								/>
								{item.login}
							</button>
						</li>
					))}
				</ul>
			)}

			{profile && (
				<div className="bg-muted/50 flex gap-4 rounded-md p-4">
					<img
						src={profile.avatarUrl}
						alt={profile.login}
						className="size-20 rounded-full"
					/>
					<div className="grid flex-1 gap-1 text-sm">
						<div>
							<span className="text-base font-semibold">
								{profile.name ?? profile.login}
							</span>{" "}
							<a
								href={profile.htmlUrl}
								target="_blank"
								rel="noreferrer"
								className="text-muted-foreground hover:underline"
							>
								@{profile.login}
							</a>
						</div>
						{profile.bio && <p>{profile.bio}</p>}
						<div className="text-muted-foreground flex flex-wrap gap-3">
							{profile.company && (
								<span className="flex items-center gap-1">
									<Building2 className="size-3.5" />
									{profile.company}
								</span>
							)}
							{profile.location && (
								<span className="flex items-center gap-1">
									<MapPin className="size-3.5" />
									{profile.location}
								</span>
							)}
						</div>
						<div className="text-muted-foreground">
							仓库 {profile.publicRepos} · 粉丝 {profile.followers} · 关注{" "}
							{profile.following}
						</div>
					</div>
					<div>
						{savedGithubIds.has(profile.githubId) ? (
							<Button variant="outline" disabled>
								<Check />
								已添加
							</Button>
						) : (
							<Button onClick={handleAdd} disabled={adding}>
								{adding ? <Loader2 className="animate-spin" /> : <UserPlus />}
								添加到数据库
							</Button>
						)}
					</div>
				</div>
			)}
		</section>
	);
}
