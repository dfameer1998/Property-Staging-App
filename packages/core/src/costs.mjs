const nonnegative=(v,name)=>{if(!Number.isFinite(v)||v<0) throw new TypeError(`Invalid ${name}.`);return v;};
export function imageAttemptCost({imageInputTokens,textInputTokens,imageOutputTokens,imageInputRate,textInputRate,imageOutputRate}) {
  return (nonnegative(imageInputTokens,'image tokens')*nonnegative(imageInputRate,'image input rate')+
    nonnegative(textInputTokens,'text tokens')*nonnegative(textInputRate,'text input rate')+
    nonnegative(imageOutputTokens,'output tokens')*nonnegative(imageOutputRate,'image output rate'))/1e6;
}
export function operatingCost(input) {
  for(const key of ['activeUsers','acceptedImagesPerUser','attemptCost','attemptsPerAcceptedImage','otherAIPerActive','mediaPerActive','baseInfrastructure','infrastructurePerActive','supportPerActive']) nonnegative(input[key],key);
  if(!Number.isInteger(input.activeUsers)||input.attemptsPerAcceptedImage<1) throw new TypeError('Invalid usage assumption.');
  const acceptedImages=input.activeUsers*input.acceptedImagesPerUser;
  const imageGeneration=acceptedImages*input.attemptCost*input.attemptsPerAcceptedImage;
  const otherAI=input.activeUsers*input.otherAIPerActive;
  const media=input.activeUsers*input.mediaPerActive;
  const infrastructure=input.baseInfrastructure+input.activeUsers*input.infrastructurePerActive;
  const support=input.activeUsers*input.supportPerActive;
  return {acceptedImages,imageGeneration,otherAI,media,infrastructure,support,total:imageGeneration+otherAI+media+infrastructure+support};
}
