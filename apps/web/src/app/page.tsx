"use client";

import { Skeleton } from "@github-user-project/ui/components/skeleton";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { GithubSearch } from "@/components/github-search";
import { UserCard } from "@/components/user-card";
import { api, errorMessage, type GithubUser } from "@/lib/api";

export default function Home() {
	// 已保存用户的列表放在页面这一层，搜索区和卡片都通过回调来更新它
	const [users, setUsers] = useState<GithubUser[]>([]);
	const [loading, setLoading] = useState(true);

	// 从列表“算”出已保存的 GitHub ID，不单独存一份，列表一变它就跟着变
	const savedGithubIds = new Set(users.map((u) => u.githubId));

	// 页面打开时加载一次列表
	useEffect(() => {
		api
			.listUsers()
			.then(setUsers)
			.catch((err) => toast.error(errorMessage(err)))
			.finally(() => setLoading(false));
	}, []);

	return (
		<main className="container mx-auto grid max-w-4xl content-start gap-6 px-4 py-6">
			<GithubSearch
				savedGithubIds={savedGithubIds}
				onAdded={(user) => setUsers((prev) => [user, ...prev])}
			/>

			<section className="grid gap-4">
				<h2 className="font-medium">已保存的用户（{users.length}）</h2>

				{loading ? (
					<div className="grid gap-4 sm:grid-cols-2">
						<Skeleton className="h-48" />
						<Skeleton className="h-48" />
					</div>
				) : users.length === 0 ? (
					<p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
						还没有保存任何用户，先在上面搜索一个吧
					</p>
				) : (
					<div className="grid gap-4 sm:grid-cols-2">
						{users.map((user) => (
							<UserCard
								key={user.id}
								user={user}
								onChange={(updated) =>
									setUsers((prev) =>
										prev.map((u) => (u.id === updated.id ? updated : u)),
									)
								}
								onDelete={(id) =>
									setUsers((prev) => prev.filter((u) => u.id !== id))
								}
							/>
						))}
					</div>
				)}
			</section>
		</main>
	);
}
