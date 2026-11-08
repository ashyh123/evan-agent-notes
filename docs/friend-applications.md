# 站内友链申请

Cloudflare Pages 的 `/api/friends` 处理申请。访客提供原来的五个中文字段。系统只读取公开 HTTPS 页面，检查互链页里的实际链接，校验通过才写入待审记录。现有友链仍从仓库读取，审核通过的新友链在打开星图时从 API 读取。

## 首次上线

1. 在 Cloudflare 创建名为 `evan-friend-applications` 的 D1 数据库。
2. 在数据库的 Console 执行 [建表 SQL](../migrations/0001_friend_applications.sql)。
3. 在 Pages 项目 `evan-huang-blog` 的生产环境绑定此数据库，变量名为 `FRIEND_APPLICATIONS`。
4. 运行现有的 `Build and publish blog` 发布流程。原服务器的友链页也使用 Pages 上的同一个接口。

## 审核

在 D1 Console 查看待审记录。

```sql
SELECT id, name, description, url, avatar, backlink, created_at
FROM friend_applications
WHERE status = 'pending'
ORDER BY id;
```

确认站点、互链页和头像后，把示例中的 `123` 换成对应编号。

```sql
UPDATE friend_applications
SET status = 'approved'
WHERE id = 123 AND status = 'pending';
```

批准后，访客下次打开或刷新友链页就能看到新头像。若不通过，将状态设为 `rejected`。
