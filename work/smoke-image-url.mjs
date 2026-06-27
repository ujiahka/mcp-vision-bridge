import { readImageInput } from "../src/image-store.js";
import { prepareImageForVision } from "../src/image-preprocess.js";

const remoteConfig = {
  provider: {
    name: "remote-test",
    baseUrl: "https://example.test/v1",
  },
  privacy: {
    allowUrlFetch: true,
    allowRemoteEndpoint: true,
  },
  limits: {
    maxImageBytes: 25 * 1024 * 1024,
  },
  image: {
    preprocess: true,
    preprocessMode: "local-only",
    urlTransport: "remote-direct",
  },
};

const image = await readImageInput({
  image_url: "https://images.example.test/demo.png",
}, remoteConfig);

if (image.url !== "https://images.example.test/demo.png") {
  throw new Error(`Expected direct image URL, got ${image.url || "missing"}`);
}
if (image.buffer) {
  throw new Error("Expected URL transport without local image buffer.");
}

const prepared = await prepareImageForVision(image, remoteConfig);
if (prepared.preprocessing?.reason !== "direct_url_transport") {
  throw new Error(`Expected direct_url_transport preprocessing skip, got ${prepared.preprocessing?.reason}`);
}

console.log("image-url-direct: ok");
