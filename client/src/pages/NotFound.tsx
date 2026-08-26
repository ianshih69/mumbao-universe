import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Home } from "lucide-react";
import { useLocation } from "wouter";

const notFoundTitle = "找不到頁面｜慢慢蒔光 STime Villa";
const notFoundDescription =
  "您造訪的頁面不存在或已移動，請返回慢慢蒔光 STime Villa 官方網站繼續瀏覽。";
const notFoundRobotsContent = "noindex,follow";

function setDescriptionMeta(content: string) {
  let description = document.head.querySelector<HTMLMetaElement>(
    'meta[name="description"]'
  );

  if (!description) {
    description = document.createElement("meta");
    description.name = "description";
    document.head.appendChild(description);
  }

  description.content = content;
}

function setNotFoundRobotsMeta() {
  const robotsMeta = Array.from(
    document.head.querySelectorAll<HTMLMetaElement>('meta[name="robots"]')
  );
  let primaryRobotsMeta = robotsMeta[0];

  if (!primaryRobotsMeta) {
    primaryRobotsMeta = document.createElement("meta");
    primaryRobotsMeta.name = "robots";
    document.head.appendChild(primaryRobotsMeta);
  }

  primaryRobotsMeta.name = "robots";
  primaryRobotsMeta.content = notFoundRobotsContent;
  primaryRobotsMeta.dataset.notFoundRobots = "true";
  robotsMeta.slice(1).forEach((meta) => meta.remove());
}

function removeHeadElements(selector: string) {
  document.head.querySelectorAll(selector).forEach((element) => {
    element.remove();
  });
}

function removeNotFoundRobotsMeta() {
  document.head
    .querySelectorAll<HTMLMetaElement>('meta[name="robots"]')
    .forEach((meta) => {
      if (
        meta.dataset.notFoundRobots === "true" &&
        meta.content === notFoundRobotsContent
      ) {
        meta.remove();
      }
    });
}

export default function NotFound() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    document.title = notFoundTitle;
    setDescriptionMeta(notFoundDescription);
    setNotFoundRobotsMeta();
    removeHeadElements('link[rel="canonical"]');
    removeHeadElements('meta[property="og:url"]');
    removeHeadElements('meta[property="twitter:url"]');
    document.getElementById("news-article-json-ld")?.remove();

    return () => {
      removeNotFoundRobotsMeta();
    };
  }, []);

  const handleGoHome = () => {
    setLocation("/");
  };

  return (
    <div className="min-h-screen-safe w-full flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <Card className="w-full max-w-lg mx-4 shadow-lg border-0 bg-white/80 backdrop-blur-sm">
        <CardContent className="pt-8 pb-8 text-center">
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="absolute inset-0 bg-red-100 rounded-full animate-pulse" />
              <AlertCircle className="relative h-16 w-16 text-red-500" />
            </div>
          </div>

          <h1 className="text-4xl font-bold text-slate-900 mb-2">404</h1>

          <h2 className="text-xl font-semibold text-slate-700 mb-4">
            Page Not Found
          </h2>

          <p className="text-slate-600 mb-8 leading-relaxed">
            Sorry, the page you are looking for doesn't exist.
            <br />
            It may have been moved or deleted.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              onClick={handleGoHome}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg"
            >
              <Home className="w-4 h-4 mr-2" />
              Go Home
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
