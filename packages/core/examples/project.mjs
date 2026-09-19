import {imageAttemptCost,operatingCost} from '../src/index.mjs';
const attemptCost=imageAttemptCost({imageInputTokens:4000,textInputTokens:800,imageOutputTokens:6000,imageInputRate:8,textInputRate:5,imageOutputRate:30});
for(const activeUsers of [250,5000,25000]) {
  console.log(JSON.stringify({activeUsers,...operatingCost({activeUsers,acceptedImagesPerUser:4,attemptCost,attemptsPerAcceptedImage:1.3,otherAIPerActive:.25,mediaPerActive:.05,baseInfrastructure:150,infrastructurePerActive:.03,supportPerActive:.1})}));
}
