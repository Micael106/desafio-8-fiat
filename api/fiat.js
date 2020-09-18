const formidable = require("formidable");
const { obj } = require("pumpify");

const Cars = [
  "TORO",
  "DUCATO",
  "FIORINO",
  "CRONOS",
  "FIAT 500",
  "MAREA",
  "LINEA",
  "ARGO",
  "RENEGADE",
];

const EntityPriority = {
  SEGURANCA: 1,
  CONSUMO: 2,
  DESEMPENHO: 3,
  MANUTENCAO: 4,
  CONFORTO: 5,
  DESIGN: 6,
  ACESSORIOS: 7,
};

const CarsPriority = {
  TORO: {
    SEGURANCA: 8,
    CONSUMO: 6,
    DESEMPENHO: 9,
    MANUTENCAO: 8,
    CONFORTO: 9,
    DESIGN: 9,
    ACESSORIOS: 6,
  },
  DUCATO: {
    SEGURANCA: 4,
    CONSUMO: 5,
    DESEMPENHO: 7,
    MANUTENCAO: 2,
    CONFORTO: 3,
    DESIGN: 2,
    ACESSORIOS: 5,
  },
  FIORINO: {
    SEGURANCA: 2,
    CONSUMO: 4,
    DESEMPENHO: 2,
    MANUTENCAO: 9,
    CONFORTO: 1,
    DESIGN: 3,
    ACESSORIOS: 1,
  },
  CRONOS: {
    SEGURANCA: 3,
    CONSUMO: 7,
    DESEMPENHO: 4,
    MANUTENCAO: 7,
    CONFORTO: 4,
    DESIGN: 7,
    ACESSORIOS: 7,
  },
  "FIAT 500": {
    SEGURANCA: 7,
    CONSUMO: 3,
    DESEMPENHO: 5,
    MANUTENCAO: 5,
    CONFORTO: 8,
    DESIGN: 5,
    ACESSORIOS: 4,
  },
  MAREA: {
    SEGURANCA: 6,
    CONSUMO: 8,
    DESEMPENHO: 8,
    MANUTENCAO: 4,
    CONFORTO: 5,
    DESIGN: 1,
    ACESSORIOS: 3,
  },
  LINEA: {
    SEGURANCA: 1,
    CONSUMO: 2,
    DESEMPENHO: 3,
    MANUTENCAO: 3,
    CONFORTO: 2,
    DESIGN: 4,
    ACESSORIOS: 2,
  },
  ARGO: {
    SEGURANCA: 5,
    CONSUMO: 9,
    DESEMPENHO: 5,
    MANUTENCAO: 6,
    CONFORTO: 7,
    DESIGN: 8,
    ACESSORIOS: 9,
  },
  RENEGADE: {
    SEGURANCA: 9,
    CONSUMO: 1,
    DESEMPENHO: 1,
    MANUTENCAO: 1,
    CONFORTO: 6,
    DESIGN: 6,
    ACESSORIOS: 8,
  },
};

module.exports = async (req, res) => {
  const form = formidable({ multiples: true });

  let { car, text, audio } = await new Promise(function (resolve, reject) {
    form.parse(req, (err, fields, files) => {
      if (err) {
        reject(err);
        return;
      }

      const { car, text } = fields;
      const { audio } = files;
      resolve({ car, text, audio });
    });
  });

  console.log("car: ", car);
  console.log("text: ", text);
  console.log("audio: ", audio);

  if (!car && (!audio || !text))
    throw new Error("No car and audio or text received");

  if (audio) text = await transcribeAudio(audio);

  const { result } = await processingText(text);

  const { entities } = result;

  // caso nenhuma entidade seja encontrado no text
  if (
    (!entities ||
      entities.length === 0 ||
      entities.reduce((acc, ett) => acc + ett.sentiment.score) >= 0,
    0)
  ) {
    res.json({
      recommendation: "",
      entities: [],
    });
    return;
  }

  let recommendedCar;

  // processo seleção do carro para redomendação
  let minEntity = entities.reduce((a, b) =>
    a.sentiment.score < a.sentiment.score ? a : b
  );
  const leastEntity = entities.filter(
    (obj) =>
      obj.text === minEntity.text &&
      obj.sentiment.score === minEntity.sentiment.score
  );
  const empateEntity = leastEntity.find((le) => {
    Math.abs(
      Math.abs(le.sentiment.score) - Math.abs(minEntity.sentiment.score)
    ) < 0.1;
  });
  if (
    empateEntity &&
    EntityPriority[empateEntity.type] > EntityPriority[minEntity.type]
  ) {
    minEntity = empateEntity;
  }

  recommendedCar = Object.entries(CarsPriority)
    .filter(([name, att]) => name !== car)
    .map(([name, att]) => [name, att[minEntity.type]])
    .reduce((a, b) => (a[1] > b[1] ? a : b))[0];

  const finalEntities = entities.map((obj) => ({
    entity: obj.type,
    sentiment: obj.sentiment.score,
    mention: obj.text,
  }));

  const data = { recommendation: recommendedCar, entities: finalEntities };

  res.json(data);
};

async function transcribeAudio(audioFile) {
  // Imports the Google Cloud client library
  const speech = require("@google-cloud/speech");
  const fs = require("fs");

  // Creates a client
  const client = new speech.SpeechClient();

  // The name of the audio file to transcribe
  const fileName = audioFile.path;

  // Reads a local audio file and converts it to base64
  const file = fs.readFileSync(fileName);
  const audioBytes = file.toString("base64");

  // The audio file's encoding, sample rate in hertz, and BCP-47 language code
  const audio = {
    content: audioBytes,
  };
  const config = {
    encoding: "FLAC",
    languageCode: "pt-BR",
    model: "command_and_search",
    audioChannelCount: 2,
  };
  const request = {
    audio: audio,
    config: config,
  };

  // Detects speech in the audio file
  const [response] = await client.recognize(request);
  const transcription = response.results
    .map((result) => result.alternatives[0].transcript)
    .join("\n");
  console.log(`Transcription: ${transcription}`);
  return transcription;
}

async function processingText(text) {
  const NaturalLanguageUnderstandingV1 = require("ibm-watson/natural-language-understanding/v1");
  const { IamAuthenticator } = require("ibm-watson/auth");

  const naturalLanguageUnderstanding = new NaturalLanguageUnderstandingV1({
    version: "2020-08-01",
    authenticator: new IamAuthenticator({
      apikey: "2TjBG3_8_wX_EmZPPmbsW4fipeD4fuLXF8GEO8CnkMg7",
    }),
    serviceUrl:
      "https://api.us-south.natural-language-understanding.watson.cloud.ibm.com/instances/6800eab1-3fb0-4723-bedb-71b04ccce424",
  });

  const analyzeParams = {
    text,
    language: "pt",
    features: {
      entities: {
        model: "20214b8d-d140-41f3-a2b2-4f2d9fdf8585",
        sentiment: true,
      },
    },
  };

  const analysisResults = await naturalLanguageUnderstanding.analyze(
    analyzeParams
  );

  console.log(JSON.stringify(analysisResults, null, 2));

  return analysisResults;
}
