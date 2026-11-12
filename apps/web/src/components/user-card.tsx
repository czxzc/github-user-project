"use client";

import { Button } from "@github-user-project/ui/components/button";
import { Textarea } from "@github-user-project/ui/components/textarea";
import { MapPin, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { api, errorMessage, type GithubUser } from "@/lib/api";

type Props = {
	user: GithubUser;
	onChange: (user: GithubUser) => void; // 修改或刷新成功后，把新数据交给父组件
	onDelete: (id: number) => void; // 删除成功后，通知父组件从列表里去掉
};

export function UserCard({ user, onChange, onDelete }: Props) {
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(user.note ?? "");
	const [busy, setBusy] = useState(false); // 有请求在进行时禁用按钮，防止重复点击

	async function run(action: () => Promise<void>) {
		setBusy(true);
		try {
			await action();
		} catch (err) {
			toast.error(errorMessage(err));
		} finally {
			setBusy(false);
		}
	}

	const saveNote = () =>
		run(async () => {
			onChange(await api.updateNote(user.id, draft.trim() || null));
			setEditing(false);
			toast.success("备注已保存");
		});

	const refresh = () =>
		run(async () => {
			onChange(await api.refreshUser(user.id));
			toast.success("资料已更新");
		});

	const remove = () => {
		if (!confirm(`确定删除 ${user.login} 吗？`)) return;
		run(async () => {
			await api.deleteUser(user.id);
			onDelete(user.id);
			toast.success(`已删除 ${user.login}`);
		});
	};

	return (
		<article className="grid gap-3 rounded-lg border p-4">
			<div className="flex items-center gap-3">
				<img
					src={user.avatarUrl}
					alt={user.login}
					className="size-12 rounded-full"
				/>
				<div className="min-w-0 flex-1">
					<div className="truncate font-semibold">
						{user.name ?? user.login}
					</div>
					<a
						href={user.htmlUrl}
						target="_blank"
						rel="noreferrer"
						className="text-muted-foreground text-sm hover:underline"
					>
						@{user.login}
					</a>
				</div>
			</div>

			{user.bio && <p className="text-sm">{user.bio}</p>}

			<div className="text-muted-foreground flex flex-wrap gap-3 text-xs">
				{user.location && (
					<span className="flex items-center gap-1">
						<MapPin className="size-3" />
						{user.location}
					</span>
				)}
				<span>仓库 {user.publicRepos}</span>
				<span>粉丝 {user.followers}</span>
				<span>关注 {user.following}</span>
			</div>

			{editing ? (
				<div className="grid gap-2">
					<Textarea
						value={draft}
						onChange={(e) => setDraft(e.target.value)}
						placeholder="写点备注…"
						maxLength={500}
					/>
					<div className="flex justify-end gap-2">
						<Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
							取消
						</Button>
						<Button size="sm" onClick={saveNote} disabled={busy}>
							保存
						</Button>
					</div>
				</div>
			) : (
				<p className="bg-muted/50 text-muted-foreground rounded px-2 py-1 text-sm">
					{user.note || "暂无备注"}
				</p>
			)}

			<div className="flex justify-end gap-1">
				<Button
					variant="ghost"
					size="sm"
					onClick={() => {
						setDraft(user.note ?? "");
						setEditing(true);
					}}
					disabled={busy}
				>
					<Pencil />
					编辑备注
				</Button>
				<Button variant="ghost" size="sm" onClick={refresh} disabled={busy}>
					<RefreshCw className={busy ? "animate-spin" : ""} />
					刷新
				</Button>
				<Button
					variant="destructive"
					size="sm"
					onClick={remove}
					disabled={busy}
				>
					<Trash2 />
					删除
				</Button>
			</div>
		</article>
	);
}
