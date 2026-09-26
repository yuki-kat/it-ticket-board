---
description: "Turn a repeated task into a reusable Copilot prompt for this workspace"
name: "Create reusable prompt"
argument-hint: "Describe the repeated task, the inputs it needs, and the output you want"
agent: "agent"
---

Turn the work underway into a reusable, single-purpose prompt file for this workspace.

Goal:
- Generalize a task pattern that is being repeated manually.
- Save it as a reusable prompt that can be invoked with `/` from chat.
- Keep the prompt focused on one job, not a full workflow or multi-step process.

Follow this process before writing the final prompt:

1. Review the current task and any similar work in the conversation.
2. Extract the core pattern:
   - What task is being repeated?
   - What inputs are implied or required?
   - What files, selections, or context are usually involved?
   - What output style or format is expected?
3. Decide whether the prompt should take arguments or rely on fixed workspace context.
4. If the pattern is not clear, ask up to 3 short clarifying questions before finalizing.
5. Draft a `.prompt.md` file in `.github/prompts/`.
6. After saving it, explain what it does and provide 2-3 example invocations.

Prompt requirements:
- Keep the prompt narrowly scoped to a single task.
- Prefer explicit instructions and output structure over vague guidance.
- Include a useful `description` and `argument-hint`.
- Use proper prompt frontmatter with `description`, `name`, and optionally `argument-hint` and `agent`.
- If the task depends on code context, specify how the user should pass it in (selected code, file path, repo context, or arguments).
- If output quality depends on format, define the expected structure clearly.

Recommended prompt structure:

```md
---
description: "<short, discoverable purpose>"
name: "<Prompt Name>"
argument-hint: "<what the user should provide>"
agent: "agent"
---

<Goal>

Use this prompt when:
- <trigger condition 1>
- <trigger condition 2>

Inputs:
- <required input>
- <optional input>

Instructions:
1. <step>
2. <step>
3. <step>

Output:
- <format>
- <style>
- <constraints>
```

When drafting the final content, make it practical and reusable for this repo. Favor concise, actionable instructions over long explanations.

Finally:
- Save the prompt file in `.github/prompts/`.
- Summarize the prompt purpose in plain language.
- Suggest example invocations like:
  - `/create reusable prompt Describe the repeated task and the desired output`
  - `/create reusable prompt Review this component and propose a refactor plan`
- If helpful, propose one or two adjacent customizations to create next.
