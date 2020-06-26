import { Telegraf } from "telegraf";
import { exit } from "process";
import axios from "axios";

// 게시판 타입
type Board = "ilbe" | "animation";

interface Channel {
  // 텔레그램 채널
  chat: string;
  // 게시판
  board: Board;
  // 서브 게시판
  sub?: string;

  baseDescription: string;
}

// 게시글 정보 interface
interface Article {
  // ID
  id: string;
  // 링크
  url: string;
  // 제목
  title: string;
  // 일베수
  comments: string;
  // 작성자
  author: string;
  // 작성시각
  datetime: string;
  // 조회수
  viewCount: string;
  // 일베수
  like: string;
}

const channels: Channel[] = [
  {
    chat: "@ilbest",
    board: "ilbe",
    baseDescription:
      "베스트 게시글 알림 채널\nsource: https://github.com/nomunyan/ilbe-channel",
  },
  {
    chat: "@ilbeani",
    board: "animation",
    sub: "best",
    baseDescription:
      "애게 인기글 알림 채널\nsource: https://github.com/nomunyan/ilbe-channel",
  },
];
const descriptionFormat = (channel: Channel, latestArticleId: string): string =>
  `${channel.baseDescription}\n최근 업데이트: ${latestArticleId}`;
const parseDescription = (description: string): string | null => {
  const result = /최근 업데이트: (.*)/gi.exec(description);
  if (result && result.length == 2) return result[1];
  else return null;
};
const messageFormat = (article: Article) =>
  `${article.title}\n\n일베: ${article.like}\n조회수: ${article.viewCount} 덧글: ${article.comments}\n링크: ${article.url}`;
const reArticle = new RegExp(
  `<a href="/view/(?<id>\\d*).*?<div class="item-box__list " >(?<title>.*?)<span class="ico-list-wrap">(?:<i class="comment">\\[(?<comments>.*?)\\])?.*?<p class="global-nick" >.*?"><\\/i>(?<author>.*?)<.*?<span class="list-item__date">(?<datetime>.*?)<.*?<span class="global-nick">조회</span> (?<viewCount>.*?)<.*?<span class="global-nick">추천</span> (?<like>.*?)<`,
  "gmis"
);
const getArticles = async (channel: Channel): Promise<Article[]> => {
  const { data } = await axios.get<string>(
    `https://m.ilbe.com/list/${channel.board}`,
    {
      params: { sub: channel.sub },
    }
  );
  const matches = [
    ...data
      .slice(
        data.indexOf(`<script>BBSListAd.show("M","${channel.board}");</script>`)
      )
      .matchAll(reArticle),
  ];
  return matches.map<Article>(({ groups: el }) => ({
    id: el?.id || "",
    url: `https://www.ilbe.com/view/${el?.id || ""}`,
    title: el?.title || "",
    comments: el?.comments || "",
    author: el?.author || "",
    datetime: el?.datetime || "",
    viewCount: el?.viewCount || "",
    like: el?.like || "",
  }));
};

if (!process.env.BOT_TOKEN) {
  console.log("plz check your BOT_TOKEN!!");
  exit();
}
const bot = new Telegraf(process.env.BOT_TOKEN);

void (async (board: string): Promise<void> => {
  const channel = channels.find((el) => el.board === board);
  if (!channel) throw new Error("This board does not exist.");

  const { description: oldDescription } = await bot.telegram.getChat(
    channel.chat
  );
  const lastArticleId = oldDescription
    ? parseDescription(oldDescription)
    : null;
  const articles = await getArticles(channel);
  const lastIndex = articles.findIndex((el) => el.id === lastArticleId);
  let newLastArticleId: string | null = null;

  for (let i = lastIndex === -1 ? 5 : lastIndex - 1; i > -1; --i) {
    try {
      await bot.telegram.sendMessage(channel.chat, messageFormat(articles[i]));
      newLastArticleId = articles[i].id || null;
    } catch (e) {
      console.log((<Error>e).message);
    }
  }

  const newDescription = newLastArticleId
    ? descriptionFormat(channel, newLastArticleId)
    : null;

  if (newDescription && oldDescription != newDescription) {
    await bot.telegram.setChatDescription(channel.chat, newDescription);
  } else console.log("no updates.");
})(process.argv[2])
  .then(() => console.log("done."))
  .catch((e: Error) => console.log(e.message));
