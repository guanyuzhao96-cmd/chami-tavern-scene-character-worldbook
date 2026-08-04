# 模拟手机「角色资料」模块

本模块属于独立的 `chami-phone-emulator` 插件，在完整模拟手机主页中新增 **角色资料** 应用。它不会加载或修改酒馆场景插件的标签、绘图、角色数据库等功能。

## 已实现

- 读取当前角色卡绑定的主世界书与附加世界书。
- 创建资料时由用户选择角色对应的固定资料条目。
- 固定资料直接来自世界书，只读；AI 与插件不会修改原条目。
- 根据当前聊天上下文生成动态资料。
- 后续只读取新增聊天并增量更新动态资料。
- 每个角色的动态资料写入独立世界书条目，供主聊天模型调用。
- 动态条目使用隐藏的 `TSP_PROFILE_ID` 识别，不依赖可修改的条目名称。
- 支持自定义动态条目前缀和命名模板。
- 支持保存设置后自动重命名当前聊天中的已有动态条目。
- 支持删除动态资料及其独立条目，不影响固定资料来源。

## 依赖

角色资料模块依赖酒馆助手提供：

- `getCharWorldbookNames('current')`
- `getWorldbook(name)`
- `updateWorldbookWith(name, updater)`
- `generateRaw(options)`

请安装酒馆助手，并启用“酒馆助手宏”。酒馆助手缺失时，模拟手机其他应用仍可使用，但角色资料无法读取世界书或生成动态资料。

## 安装地址

仓库重命名后，在 SillyTavern 的扩展安装界面粘贴：

```text
https://github.com/guanyuzhao96-cmd/chami-phone-emulator
```

## 默认命名模板

```text
{prefix}{character}·{chatId}
```

默认前缀：

```text
【角色资料·动态】
```

支持变量：

```text
{prefix} {character} {card} {chatId} {profileId} {type} {date}
```

## 当前版本边界

当前版本提供手动创建、手动增量更新、条目命名设置和删除。自动按消息数量更新、删楼或切换回复后的版本回滚、固定资料重新绑定和独立 API 配置尚未加入。
