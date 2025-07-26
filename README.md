# Playlist Transfer Chrome Extension

A Chrome extension that enables seamless playlist transfers between major music streaming platforms.

## Supported Platforms

- **Spotify** - Full playlist import/export support
- **Apple Music** - Web player integration 
- **YouTube Music** - Playlist management via YouTube Data API
- **Amazon Music** - Multi-region support (US, UK, Germany, Canada)

## Features

- **Cross-Platform Transfer**: Move playlists between any supported music services
- **Bulk Operations**: Transfer multiple playlists at once
- **Metadata Preservation**: Maintains playlist names, descriptions, and track order
- **Authentication Management**: Secure OAuth integration with all platforms
- **Real-Time Progress**: Visual feedback during transfer operations
- **Conflict Resolution**: Handle duplicate tracks and unavailable songs intelligently

## Setup

1.  Clone this repository.
2.  **Create a `config.js` file** in the root directory of the project.
3.  Add your API credentials to `config.js` by following the structure in `config.example.js`.
4.  Open Chrome and navigate to `chrome://extensions/`.
5.  Enable "Developer mode" and click "Load unpacked" to load the extension.

## Usage

1. **Navigate** to any supported music platform in your browser
2. **Select Playlists** using the transfer buttons that appear on playlist pages
3. **Choose Destination** platform from the extension popup
4. **Monitor Progress** through the real-time transfer status
5. **Review Results** for any tracks that couldn't be transferred

## File Structure

```
├── manifest.json           # Extension configuration
├── background.js           # Service worker for API calls
├── popup.html             # Extension popup interface
├── popup.js               # Popup functionality       
├── spotify_content.js     # Spotify content script
├── apple_content.js       # Apple Music content script
├── youtube_content.js     # YouTube Music content script
├── amazon_content.js      # Amazon Music content script
├── images/                # Extension icons and assets
└── styles/               # CSS styling
```

## Known Limitations

- **API Rate Limits**: Large playlists may take time due to platform restrictions
- **Track Availability**: Some songs may not be available across all platforms
- **Regional Restrictions**: Certain tracks may be blocked in specific countries
- **Authentication Expiry**: May require periodic re-authentication

## Troubleshooting

**Transfer Failed**: Check internet connection and ensure you're authenticated on both platforms

**Missing Tracks**: Some songs may not exist on the destination platform - check the transfer report

**Authentication Errors**: Clear extension storage and re-authenticate with the affected platform

**Slow Performance**: Large playlists (500+ tracks) may take several minutes to transfer

## Development

To contribute or modify this extension:

1. Fork the repository
2. Make your changes
3. Test thoroughly across all supported platforms
4. Submit a pull request with a clear description

## Privacy

This extension:
- Only accesses music platforms you explicitly visit
- Stores minimal user data locally in Chrome
- Does not collect or transmit personal information
- Uses official APIs where available

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For issues, feature requests, or questions:
- Open an issue on the GitHub repository
- Check the troubleshooting section above
- Ensure you have the latest version installed

## Version History

- **v1.0.0** - Initial release with basic transfer functionality
- **v1.1.0** - Added bulk transfer support
- **v1.2.0** - Improved error handling and user feedback

---

**Note**: This extension is not affiliated with Spotify, Apple Music, YouTube Music, or Amazon Music. All trademarks belong to their respective owners.
