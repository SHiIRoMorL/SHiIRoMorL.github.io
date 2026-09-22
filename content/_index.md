---
# 首页自身（不是一篇文章）。这里的数据可通过 {{ .Title }} 等模板变量取用。
title: 主页

# 侧边栏导航菜单。以后新增页面时，把页面的 front matter 里加上
# menu.main 即可自动出现在这里，例如：
#
#   menu:
#       main:
#           name: 关于
#           weight: -90
#           params:
#               icon: user
#
# 当前只保留主页这一项。
menu:
    main:
        name: 主页
        weight: -100
        params:
            icon: home
---

<!-- 下面是首页正文区域（显示在文章列表上方）。留空即只有文章列表。 -->
