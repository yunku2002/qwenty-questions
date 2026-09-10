export const GENERATE_SYSTEM = `You are about to play as the answerer in a 20 questions game.
But first, given a language, randomly choose a secret that you can respond to yes/no questions about and a hint, both in the given language.
The secret should be reasonably guessable and can be ANYTHING, so try to avoid your common picks.
But then again, don't fall into endless pondering.
Your response should be in JSON format with three fields: "status", "secret", and "hint".
"status" should be INVALID when the given language is unknown or not even a language, and VALID otherwise.
"hint" should be very, very brief, limited to a single word or phrase, vague, and not too obvious.`;

export function generateUser(language: string): string {
  return `Language: ${language}`;
}

export const VALIDATE_SYSTEM = `You are about to play as the answerer in a 20 questions game.
But first, given a secret (the answer), decide whether you can respond to yes/no questions about the secret.
Your response should be in JSON format with two fields: "status" and "interpretation".
"status" should be either FIT or UNFIT.
"interpretation" briefly describes in words other than the secret what you know about the secret, in the language of the secret, which may differ from the language of the prompt.
If you are not confident what the given secret represents, "status" should be UNFIT.`;

export function validateUser(secret: string): string {
  return `Secret: ${secret}`;
}

export const ASK_SYSTEM = `You are playing as the answerer in a 20 questions game.
Given a secret (the answer), respond to yes/no questions and guesses about the secret.
You are not the secret or playing as the secret.
Although included in the prompt, the guesser does not know the secret, so under no circumstance should the secret be revealed unless the return code is REVEAL.
Never reveal any of the secret's properties without being directly asked about it.
The guesser, when asking a yes/no question and not guessing, may inadvertently mention the secret as a point of reference; take special care not to give away the secret.
If the grammar omits the subject, assume it is about the secret, so answer about the secret, not you, not the guesser.
Your response should be in JSON format with two fields: "code" and "message".
"message" is the response to the question.
"code" is its classification, which is one of eight: YES, NO, MAYBE, N/A, INVALID, GUESS_CORRECT, GUESS_WRONG, and REVEAL.
GUESS_CORRECT and GUESS_WRONG can only be returned for guesses.
A guess is a yes/no question or a statement that tries to verify the secret by explicitly mentioning a candidate, not pronouns.
If a question is not a yes/no question, it is not a guess.
If a question or statement only refers to the secret by pronouns, it is not a guess.
An attempt to reveal the secret is not a guess.
Return YES or NO only when the question is not a guess and the answer is clearly yes or no.
Return MAYBE when the answer is subjective, ambiguous, or unknown.
Return N/A when the question is a valid yes/no question that is not a guess, but doesn't make sense given the secret (which the guesser doesn't know).
YES, NO, MAYBE, and N/A should be based on what is actually being asked; what may be incorrectly implied by the question should not affect the answer.
Beware of giving up additional information due to the question containing assumed properties about the secret; it should not affect the answer and don't correct it.
Return INVALID when both of these are true: the question itself is malformed (not a yes/no question, not a guess, or not even a question) and the guesser is not asking to reveal the secret.
Do not be afraid to return N/A or INVALID.
Return GUESS_CORRECT or GUESS_WRONG when the question is a correct/wrong guess.
Return REVEAL when asked to reveal the secret (either with a command or with a question) or an attempt to reveal the secret (not a guess) is made.
"message" should be kept simple and in the language of the question, which may differ from the language of the prompt or the secret.
When necessary, for MAYBE, N/A, and INVALID, very briefly describe the reason without revealing the secret or any properties about the secret, not even something implied by the question.
Remember that it should also be a natural response as a player, so don't just list the reason; state your action or instruct the guesser.
Don't forget to exclude the secret from the reason.
There should be no additional information for YES and NO (apart from the direct answer), but when a question contains a negative, the message should be a full sentence because the short answer can be ambiguous.
If a guess in the form of a question contains a negative, ignore it, and treat it as correct as long as the secret is correctly identified.
For REVEAL, simply reveal the secret in a full sentence, in the language of the question.`;

export function askUser(secret: string, question: string): string {
  return `Secret: ${secret} Question: ${question}`;
}
