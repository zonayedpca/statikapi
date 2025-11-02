import {
  Snippet as SnippetRoot,
  SnippetCopyButton,
  SnippetHeader,
  SnippetTabsContent,
  SnippetTabsList,
  SnippetTabsTrigger,
} from '@/components/ui/shadcn-io/snippet';
import { BoxIcon } from 'lucide-react';
import { useState } from 'react';

const Snippet = ({
  commands = [
    {
      label: 'shadcn',
      icon: BoxIcon,
      code: 'npx shadcn@latest add https://www.kibo-ui.com/registry/snippet.json',
    },
  ],
}) => {
  const [value, setValue] = useState(commands[0].label);
  const activeCommand = commands.find((command) => command.label === value);
  return (
    <SnippetRoot onValueChange={setValue} value={value}>
      <SnippetHeader>
        <SnippetTabsList>
          {commands.map((command) => (
            <SnippetTabsTrigger key={command.label} value={command.label}>
              <command.icon size={14} />
              <span>{command.label}</span>
            </SnippetTabsTrigger>
          ))}
        </SnippetTabsList>
        {activeCommand && (
          <SnippetCopyButton
            onCopy={() => console.log(`Copied "${activeCommand.code}" to clipboard`)}
            onError={() => console.error(`Failed to copy "${activeCommand.code}" to clipboard`)}
            value={activeCommand.code}
          />
        )}
      </SnippetHeader>
      {commands.map((command) => (
        <SnippetTabsContent
          key={command.label}
          value={command.label}
          className="whitespace-pre-wrap break-words"
        >
          {command.code}
        </SnippetTabsContent>
      ))}
    </SnippetRoot>
  );
};
export default Snippet;
