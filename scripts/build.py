import os

def main():
    # Define file paths
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    
    src_dir = os.path.join(project_root, 'src')
    dist_dir = os.path.join(project_root, 'docs') # GitHub Pages serves from 'docs' folder

    if not os.path.exists(dist_dir):
        os.makedirs(dist_dir)

    index_path = os.path.join(src_dir, 'index.html')
    style_path = os.path.join(src_dir, 'style.css')
    script_path = os.path.join(src_dir, 'script.js')
    output_path = os.path.join(dist_dir, 'index.html') # GitHub Pages serves index.html

    # Read CSS and JS content
    with open(style_path, 'r', encoding='utf-8') as f:
        css_content = f.read()

    with open(script_path, 'r', encoding='utf-8') as f:
        js_content = f.read()

    # Process HTML line by line to handle indentation
    output_lines = []
    with open(index_path, 'r', encoding='utf-8') as f:
        for line in f:
            if '<link rel="stylesheet" href="style.css">' in line:
                indent = line[:line.find('<')]
                # Indent CSS lines (indent + 4 spaces)
                css_indented = '\n'.join((indent + '    ' + l).rstrip() for l in css_content.splitlines())
                output_lines.append(f'{indent}<style>\n{css_indented}\n{indent}</style>\n')
            elif '<script src="script.js"></script>' in line:
                indent = line[:line.find('<')]
                # Indent JS lines
                js_indented = '\n'.join((indent + '    ' + l).rstrip() for l in js_content.splitlines())
                output_lines.append(f'{indent}<script>\n{js_indented}\n{indent}</script>\n')
            else:
                output_lines.append(line)

    # Write combined file
    with open(output_path, 'w', encoding='utf-8') as f:
        f.writelines(output_lines)
    
    print(f"Created {os.path.relpath(output_path, project_root)}")

if __name__ == '__main__':
    main()
