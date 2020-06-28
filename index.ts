import { Telegraf } from "telegraf";
import { exit } from "process";
import axios from "axios";
import { AllHtmlEntities as Entities } from "html-entities";

// 게시판 타입
type Board = "ilbe" | "animation";

interface Channel {
  // 텔레그램 채널
  chat: string;
  // 게시판
  board: Board;
  // 서브 게시판
  sub?: string;
  // 설명
  baseDescription: string;
}

// 게시글 정보 interface
interface Article {
  // ID
  id: string;
  // count
  count: string;
  // 링크
  url: string;
  // 이미지
  image?: string;
  // 분류
  category?: string;
  // 제목
  title: string;
  // 내용
  content: string;
  // 덧글수
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

const entities = new Entities();

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

const descriptionFormat = (channel: Channel, latestArticle: Article): string =>
  `${channel.baseDescription}\n최근 업데이트: ${latestArticle.id}|${latestArticle.count}`;

const parseDescription = (
  description: string
): [string, string] | [null, null] => {
  const result = /최근 업데이트: (.*)\|(.*)/gi.exec(description);
  if (result && result.length == 3) return [result[1], result[2]];
  else return [null, null];
};

const getLastIndex = (articles: Article[], description?: string): number => {
  const [lastArticleId, count] = description
    ? parseDescription(description)
    : [null, null];
  const lastIdIndex = articles.findIndex((el) => el.id === lastArticleId);
  const lastCountIndex = articles.findIndex((el) => el.count === count);
  return lastIdIndex !== -1
    ? lastIdIndex - 1
    : lastCountIndex !== -1
    ? lastCountIndex
    : 5;
};

const messageFormat = (article: Article) => `
<b>${article.category ? article.category + " | " : ""}${article.title}</b>
${article.content}

✍ ${article.author}
👌 ${article.like}     👀 ${article.viewCount}     💬 ${article.comments}
🔗 ${article.url}
`;

const reArticle = new RegExp(
  `<li>[\\t\\n\\r ]*<span class="count">(?<count>.*?)<.*?<span class="title" >.*?(?:<img class="lazy_thumbnail" data="(?<image>.*?)".*?)?(?:<em class="line-cate".*?>(?<category>.*?)<.*?)?<a href="\\/view\\/(?<id>.*?)\\?.*?class="subject">(?<title>.*?)<.*?iconReply.gif" \\/><a>(?<comments>.*?)<.*?class="content">(?<content>.*?)<.*?nick">.*?">(?<author>.*?)<.*?date">(?<datetime>.*?)<.*?view">(?<viewCount>.*?)<.*?recomm">(?<like>.*?)<`,
  "gmis"
);

const getArticles = async (channel: Channel): Promise<Article[]> => {
  const { data } = await axios.get<string>(
    `https://www.ilbe.com/list/${channel.board}?listStyle=webzine`,
    {
      params: { sub: channel.sub },
    }
  );
  const matches = [...data.matchAll(reArticle)];
  return matches.map<Article>(({ groups: el }) => ({
    id: el?.id || "",
    count: el?.count || "",
    url: `https://ilbe.com/view/${el?.id || ""}`,
    title: el?.title || "",
    comments: el?.comments || "",
    author: el?.author || "",
    datetime: el?.datetime || "",
    viewCount: el?.viewCount || "",
    like: el?.like || "",
    image: el?.image,
    content: entities.decode(el?.content || ""),
    category: el?.category,
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
  const articles = await getArticles(channel);
  let newLastArticle: Article | null = null;

  for (let i = getLastIndex(articles, oldDescription); i > -1; --i) {
    try {
      const image = articles[i].image;
      if (image) {
        const { data } = await axios.get<NodeJS.ReadableStream>(image, {
          responseType: "stream",
        });
        await bot.telegram.sendPhoto(
          channel.chat,
          { source: data },
          {
            caption: messageFormat(articles[i]),
            parse_mode: "HTML",
          }
        );
      } else
        await bot.telegram.sendMessage(
          channel.chat,
          messageFormat(articles[i]),
          {
            parse_mode: "HTML",
          }
        );
      newLastArticle = articles[i];
    } catch (e) {
      console.log((<Error>e).message);
    }
  }

  const newDescription = newLastArticle
    ? descriptionFormat(channel, newLastArticle)
    : null;

  if (newDescription && oldDescription != newDescription) {
    await bot.telegram.setChatDescription(channel.chat, newDescription);
  } else console.log("no updates.");
})(process.argv[2])
  .then(() => console.log("done."))
  .catch((e: Error) => console.log(e.message));
